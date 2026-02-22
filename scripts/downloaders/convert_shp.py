"""Convert shapefile ZIP to GeoJSON with coordinate transformation."""
import shapefile
import pyproj
import json
import os
import sys
import zipfile
import tempfile

def shp_zip_to_geojson(zip_path, output_path=None, source_crs='EPSG:2039', target_crs='EPSG:4326'):
    """Extract shapefile from ZIP and convert to GeoJSON with CRS transform."""
    
    # Extract ZIP to temp dir
    td = tempfile.mkdtemp()
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(td)
    
    # Find .shp file
    shp_files = [f for f in os.listdir(td) if f.lower().endswith('.shp')]
    if not shp_files:
        raise ValueError("No .shp file found in ZIP")
    
    shp_path = os.path.join(td, shp_files[0])
    layer_name = os.path.splitext(shp_files[0])[0]
    print(f"Reading: {layer_name}")
    
    # Read shapefile
    sf = shapefile.Reader(shp_path, encoding='utf-8')
    print(f"  Shape type: {sf.shapeTypeName}")
    print(f"  Records: {len(sf)}")
    
    # Setup coordinate transformer
    transformer = pyproj.Transformer.from_crs(source_crs, target_crs, always_xy=True)
    
    # Get field names
    field_names = [f[0] for f in sf.fields[1:]]
    
    # Build GeoJSON features
    features = []
    for i, (shape_rec) in enumerate(sf.iterShapeRecords()):
        shape = shape_rec.shape
        record = shape_rec.record
        
        # Transform coordinates  
        if shape.shapeType == 0:  # Null shape
            continue
            
        geom_type = sf.shapeTypeName
        
        if geom_type in ('POLYGON', 'POLYGONZ', 'POLYGONM'):
            # Handle polygon parts
            rings = []
            parts = list(shape.parts) + [len(shape.points)]
            for pi in range(len(parts) - 1):
                ring = []
                for pt in shape.points[parts[pi]:parts[pi+1]]:
                    x, y = transformer.transform(pt[0], pt[1])
                    ring.append([round(x, 7), round(y, 7)])
                # Ensure ring is closed
                if ring[0] != ring[-1]:
                    ring.append(ring[0])
                rings.append(ring)
            
            if len(rings) == 1:
                geometry = {"type": "Polygon", "coordinates": rings}
            else:
                geometry = {"type": "Polygon", "coordinates": rings}
                
        elif geom_type in ('POLYLINE', 'POLYLINEZ', 'POLYLINEM'):
            parts = list(shape.parts) + [len(shape.points)]
            lines = []
            for pi in range(len(parts) - 1):
                line = []
                for pt in shape.points[parts[pi]:parts[pi+1]]:
                    x, y = transformer.transform(pt[0], pt[1])
                    line.append([round(x, 7), round(y, 7)])
                lines.append(line)
            if len(lines) == 1:
                geometry = {"type": "LineString", "coordinates": lines[0]}
            else:
                geometry = {"type": "MultiLineString", "coordinates": lines}
                
        elif geom_type in ('POINT', 'POINTZ', 'POINTM'):
            x, y = transformer.transform(shape.points[0][0], shape.points[0][1])
            geometry = {"type": "Point", "coordinates": [round(x, 7), round(y, 7)]}
            
        elif geom_type in ('MULTIPOINT', 'MULTIPOINTZ', 'MULTIPOINTM'):
            coords = []
            for pt in shape.points:
                x, y = transformer.transform(pt[0], pt[1])
                coords.append([round(x, 7), round(y, 7)])
            geometry = {"type": "MultiPoint", "coordinates": coords}
        else:
            continue
        
        # Build properties
        properties = {}
        for fi, fname in enumerate(field_names):
            val = record[fi]
            if isinstance(val, bytes):
                val = val.decode('utf-8', errors='replace')
            properties[fname] = val
        
        features.append({
            "type": "Feature",
            "properties": properties,
            "geometry": geometry
        })
    
    geojson = {
        "type": "FeatureCollection",
        "name": layer_name,
        "features": features
    }
    
    if output_path:
        os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(geojson, f, ensure_ascii=False)
        print(f"  Saved: {output_path} ({len(features)} features)")
    
    # Cleanup
    import shutil
    shutil.rmtree(td, ignore_errors=True)
    
    return geojson, layer_name


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python convert_shp.py <zip_path> [output_path]")
        sys.exit(1)
    
    zip_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else None
    
    if not output_path:
        name = os.path.splitext(os.path.basename(zip_path))[0]
        output_path = f"data/uploads/{name}.geojson"
    
    shp_zip_to_geojson(zip_path, output_path)
