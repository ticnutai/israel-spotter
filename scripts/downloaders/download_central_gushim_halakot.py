import json
import time
import requests
from urllib.parse import quote


def create_replica(feature_service_url, layer_id, where, replica_name, out_format='shapefile', async_mode=True, auth_token=None):
    """
    Request a replica (filtered dataset) from an ArcGIS Feature Service using the createReplica operation.

    Parameters
    ----------
    feature_service_url : str
        Base URL of the feature service (without trailing '/'). Example:
        'https://services8.arcgis.com/JcXY3lLZni6BK4El/arcgis/rest/services/חלקות/FeatureServer'
    layer_id : int
        Index of the layer within the service (e.g., 0).
    where : str
        SQL where clause to filter features (e.g., 'REGION_ID = 4').
    replica_name : str
        Name for the replica (use only ASCII letters/numbers/underscores).
    out_format : str, optional
        Output data format: 'shapefile', 'filegdb', 'geojson', etc.
        See ArcGIS REST API docs for supported formats.
    async_mode : bool, optional
        Whether to request the replica asynchronously (recommended for large datasets).
    auth_token : str, optional
        Token for secured services (not needed for public data).

    Returns
    -------
    dict
        A dictionary containing 'status_url' and possibly 'result_url' keys.

    Notes
    -----
    For asynchronous jobs you must poll the status URL until the job completes, then download
    the file from the result URL. See the poll_status function below.
    """
    # Build layerQueries parameter. It expects a JSON-encoded string where the layer ID is
    # the key, mapping to a dict containing the 'where' clause.
    layer_queries = json.dumps({str(layer_id): {"where": where}}, ensure_ascii=False)

    params = {
        'f': 'json',
        'replicaName': replica_name,
        'layers': layer_id,
        'layerQueries': layer_queries,
        'dataFormat': out_format,
        'returnAttachments': False,
        'returnAttachmentDatabyURL': False,
        'async': 'true' if async_mode else 'false',
        'syncModel': 'none',
        'transportType': 'esriTransportTypeUrl',  # ensures result is given as URL
    }

    if auth_token:
        params['token'] = auth_token

    url = f"{feature_service_url}/createReplica"
    resp = requests.post(url, data=params)
    resp.raise_for_status()
    result = resp.json()

    # When async_mode is false and the job finishes quickly, 'resultUrl' may appear directly
    # in the response. Otherwise we get a 'statusUrl' to poll.
    return {
        'status_url': result.get('statusUrl'),
        'result_url': result.get('resultUrl')
    }


def poll_status(status_url, auth_token=None, interval=15):
    """
    Poll a replica status URL until the job is finished.

    Parameters
    ----------
    status_url : str
        URL returned by create_replica. Should end with '/jobs/<jobId>'.
    auth_token : str, optional
        Token for secured services.
    interval : int, optional
        Number of seconds to wait between polling attempts.

    Returns
    -------
    str
        Final result download URL when the job completes.

    Raises
    ------
    Exception if the job fails or times out.
    """
    params = {'f': 'json'}
    if auth_token:
        params['token'] = auth_token

    while True:
        r = requests.get(status_url, params=params)
        r.raise_for_status()
        data = r.json()
        status = data.get('jobStatus') or data.get('status')
        if status in ('Completed', 'completed'):  # case-insensitive check
            return data.get('resultUrl') or data.get('result_url')
        elif status in ('Failed', 'failed', 'Cancelled', 'canceled'):
            raise Exception(f"Replica job failed with status: {status}\nDetails: {json.dumps(data, indent=2, ensure_ascii=False)}")
        else:
            print(f"Job status: {status}, waiting {interval}s...")
            time.sleep(interval)


def download_file(url, output_path):
    """
    Download a file from the given URL and save it to output_path.

    Parameters
    ----------
    url : str
        URL of the file to download.
    output_path : str
        Path on the local filesystem where the file should be saved.
    """
    with requests.get(url, stream=True) as r:
        r.raise_for_status()
        with open(output_path, 'wb') as f:
            for chunk in r.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)


if __name__ == '__main__':
    # Example usage: download parcels and blocks for Israel's Central District (REGION_ID = 4)
    # For each dataset, we specify the service URL and layer ID (0).
    datasets = [
        {
            'name': 'parcels_central',
            'service_url': 'https://services8.arcgis.com/JcXY3lLZni6BK4El/arcgis/rest/services/חלקות/FeatureServer',
            'layer_id': 0,
            'where': 'REGION_ID = 4',
        },
        {
            'name': 'blocks_central',
            'service_url': 'https://services8.arcgis.com/JcXY3lLZni6BK4El/arcgis/rest/services/שכבת_גושים/FeatureServer',
            'layer_id': 0,
            'where': 'REGION_ID = 4',
        }
    ]

    for ds in datasets:
        print(f"Requesting replica for {ds['name']}...")
        replica = create_replica(
            feature_service_url=ds['service_url'],
            layer_id=ds['layer_id'],
            where=ds['where'],
            replica_name=f"{ds['name']}_replica",
            out_format='shapefile',
            async_mode=True,
            auth_token=None  # Add your token here if the service is secured
        )
        status_url = replica['status_url'] or replica['result_url']
        if status_url is None:
            raise Exception('createReplica did not return a status or result URL.')
        print(f"Polling job: {status_url}")
        result_url = None
        if replica.get('result_url'):
            result_url = replica['result_url']
        else:
            result_url = poll_status(status_url)

        print(f"Downloading result from {result_url}...")
        output_zip = f"{ds['name']}.zip"
        download_file(result_url, output_zip)
        print(f"Downloaded {output_zip}")
