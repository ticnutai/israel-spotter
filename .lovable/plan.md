

## Israeli Cadastral & Address Location Finder

A clean, focused tool for finding locations in Israel by cadastral block/parcel numbers or street address, displayed on an interactive map.

### Page Layout
- **Search panel** at the top with two search modes (tabs):
  1. **Gush & Helka** – Two input fields for block number and parcel number
  2. **Address** – A single text input for a residential address
- **Interactive map** filling the rest of the screen below, powered by OpenStreetMap via Leaflet
- A "Search" button that queries the GovMap API and drops a pin on the found location

### Search by Gush & Helka
- User enters a Gush (block) number and Helka (parcel) number
- The app calls GovMap's cadastral API to resolve the parcel to geographic coordinates
- The map zooms to that location and places a marker with a popup showing the Gush/Helka info

### Search by Address
- User enters a street address in Hebrew or English
- The app uses GovMap's geocoding service to resolve the address to coordinates
- The map zooms in and places a marker with the address in a popup

### Map Features
- Interactive OpenStreetMap with zoom, pan, and scroll controls
- Marker with popup showing the searched Gush/Helka or address
- Map automatically centers and zooms to fit the result
- Clean, full-width map for easy viewing

### Design
- Simple, modern Hebrew-friendly interface (RTL support)
- Minimal UI – just the search bar and the map
- Mobile-responsive layout so it works on phones too
- Clear error messages if a location isn't found

