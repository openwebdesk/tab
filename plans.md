# Programs
- .js files
- iframe based controlled html rendering (no inline js)
- html output api
- apps register seperately as appName@creatorName

# Windows
- apps optionally can add an html display
- default display being terminal

# Abstraction
- files
- vfs
- memory
- processes

## Process calls
- API calls: provide tasks that an app can do itself.
- To be callable, app has to define a call processor. Templetes can exist.
- This call function will have different params: 
  - Call type
  - Call data
  - Caller
  - Call target method

### API Call Types
- Request-Respose: app responds to call with data. No UI. 
  - > Requester App -> Handler App -> Response to Requestor.
- UI-demand: app responds by showing a UI to the user. 
  - > Requester App -> Handler App -> user -> Response to Requestor.
- UI-less call: one-way call for app. No UI.
- UI call: one-way call for app.

### Call target method
A method in an app that can be called from external sources. Can be used to call in-app functions.
> Requester App -> Handler App -> Handler function.
Ex: Call to capture a selfie via the camera app.

### Call data
Various data to be sent to the handler app. Ex: app data to virus scanner.