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

You begin interacting with SelfNetFS with the `SNFS.Http` class. To create a
new instance of this class, you will need the owner URL.

```javascript
const api = new SNFS.Http(owner_url);
```

As a convention, the variable named `api` is used to represent an instance of
this class throughout this document.

#### Method `login(options)`

Attempt to log in as a particular user.

* `options.name` - **string** - The user name.
* `options.password` - **string** - The user's password.

Return value:

* Will throw a `SNFS.SNFSError` error upon failure to log in.
* Will return a `SNFS.SNFSSession` object upon success.

Example:

```javascript
ses = await api.login({ name: 'someuser', password: 'somepass' });
```

#### Method `resume(session_token)`

Attempt to resume a session from a token retrieved from a previously
established session.

* `session_token` - **string** - A session to resume.

Return value:

* Will throw a `SNFS.SNFSError` error upon failure to log in.
* Will return a `SNFS.SNFSSession` object upon success.

Example:

```javascript
session_token = localStorage.getItem('snfs_session_token');
ses = await api.resume(session_token);
```

## Session Management

## User Operations

* `userlist()`
* `useradd()`
* `usermod()`
* `userdel()`

## File System Operations
