# SelfNetFS User Manual

Welcome to the SelfNetFS user manual. This manual provides operation
instructions and technical details for the SelfNetFS library.

## Overview

SelfNetFS is a JavaScript library developed in TypeScript.
A working knowledge of JavaScript will be required to make the most of this manual.
Example code is provided in JavaScript.

## Owner/User

The term "owner" is used to make a distinction between the individual using
SelfNetFS and separate "user" accounts that they manage for the same pool of
data.

In practice, the "owner" is yourself and access to file storage is available
over HTTP via an owner URL. For example, your owner URL might be
`https://selfnetfs-api.home.arpa/myowner`.

With the owner URL, an HTTP request can be made to log in as a particular
"user". "user," in this case, refers more to a specific web application using
SelfNetFS. For example, you might have a user account for a web application you
trust and an user account for a web application you are trying out for the
first time. Note: the HTTP requests are encapsulated in the SelfNetFS
JavaScript API.

Parts of the URL:

* `https://` - Indicates that the URL is for a secure HTTP endpoint.
  `https://` is required, `http://` will likely cause security issues with the browser
  and the library will not work correctly.
* `selfnetfs-api.home.arpa` - Indicates the host that the library will be communicating with.
  Typically this will be an host on the public internet, but can be valid host is allowed.
* `myowner` - Indicates the owner name.
  This is used to differentiate between separate owners on a single server.

## Session Management

### Life Cycle

<!-- TODO: Discuss logging in, leaving the page, resuming a session, and logging out -->

## User Operations

* `userlist()`
* `useradd()`
* `usermod()`
* `userdel()`

## File System Operations

## Reference

### Class `SNFS.Http`

You begin interacting with SelfNetFS with the `SNFS.Http` class. To create a
new instance of this class, you will need the owner URL.

```javascript
api = new SNFS.Http(owner_url);
```

As a convention, the variable named `api` is used to represent an instance of
the `SNFS.Http` class throughout this document.

#### Method `login(options)`

Attempt to log in as a particular user.

* `options.name` - **string** - The user name.
* `options.password` - **string** - The user's password.

Return value:

* Will throw a `SNFS.SNFSError` error upon failure to log in.
* Will return a `SNFS.Session` object upon success.

Example:

```javascript
ses = await api.login({ name: 'someuser', password: 'somepass' });
```

As a convention, the variable named `ses` is used to represent an instance of
the `SNFS.Session` class throughout this document.

#### Method `resume(session_token)`

Attempt to resume a session from a token retrieved from a previously
established session.

* `session_token` - **string** - A session to resume.

Return value:

* Will throw a `SNFS.SNFSError` error upon failure to log in.
* Will return a `SNFS.Session` object upon success.

Example:

```javascript
session_token = localStorage.getItem('snfs_session_token');
ses = await api.resume(session_token);
```

As a convention, the variable named `ses` is used to represent an instance of
the `SNFS.Session` class throughout this document.

### Class `SNFS.Session`

See class `SNFS.Http` for details on acquiring instances of this class.

### Class `SNFS.FileSystem`

See class `SNFS.Session` for details on acquiring instances of this class.
