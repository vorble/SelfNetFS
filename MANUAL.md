# SelfNetFS User Manual

Welcome to the SelfNetFS user manual. This manual provides operation
instructions and technical details for the SelfNetFS library.

## Overview

SelfNetFS is a JavaScript library developed in TypeScript.
A working knowledge of JavaScript will be required to make the most of this manual.
Example code is provided in JavaScript.

## Owner/User

<!-- TODO: Describe what an owner is. -->
<!-- TODO: Describe what a user is. -->

<!-- TODO: "instance"? Not a good word here -->
An instance of SelfNetFS is referenced by an owner URL.
For example, `https://selfnetfs-api.home.arpa/myowner`.

Parts of the URL:

* `https://` - Indicates that the URL is for a secure HTTP endpoint.
  `https://` is required, `http://` will likely cause security issues with the browser
  and the library will not work correctly.
* `selfnetfs-api.home.arpa` - Indicates the host that the library will be communicating with.
  Typically this will be an host on the public internet, but can be valid host is allowed.
* `myowner` - Indicates the owner name.
  This is used to differentiate between separate owners on a single server.

## API

### Class `SNFS.Http`

You begin interacting with SelfNetFS with the `SNFS.Http` class.

```javascript
const api = new SNFS.Http(owner_url);
```

The following methods are available on the `api` object:

* `login(options)`
  - `options.name` - **string** - The user name.
  - `options.password` - **string** - The user's password.
* `resume(session_token)`
  - `session_token` - **string** - A session to resume.

## Session Management

## User Operations

* `userlist()`
* `useradd()`
* `usermod()`
* `userdel()`

## File System Operations
