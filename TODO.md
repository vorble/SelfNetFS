# TODO

* Add user permission check when doing actions on a FS in the in-memory
  implementation so it is in line with how the HTTP API works. The HTTP API
  grabs a new fs instance on each action, so it is effectively checking user
  permissions to the file systems.
* Add more introspection options for the session to get user info and on a file
  system to get current usage and info about the unions it might have (all
  acquire options).
* Validate request body and other user provided arguments.
