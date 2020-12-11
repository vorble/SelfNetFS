# selfnetfs

A file system for browser applications.

## Guide

Brief overview of how to work with the project at this state:

* Build the browser library with `npm run build`.
* Bootstrap a new database: `ts-node server/index.ts --init username password`.
* Run the server with the command `npm run start` (listens on port 4000).
* Run the example www assets with `npm run www` (listens on port 4001.
* Have `selfnetfs-ui.home.arpa` point to `127.0.0.1` in `/etc/hosts`.
* Have `selfnetfs-api.home.arpa` point to `127.0.0.1` in `/etc/hosts`.
* Set up nginx to serve both `.home.arpa` addresses with a valid SSL certificate (I self signed on and trusted it in my browser).
  - Reverse proxy `selfnetfs-api.home.arpa` to `127.0.0.1:4000`
  - Reverse proxy `selfnetfs-api.home.arpa` to `127.0.0.1:4001`
