# SelfNetFS User Manual

Welcome to the SelfNetFS user manual. This manual provides operation
instructions and technical details for the SelfNetFS library.

## Overview

SelfNetFS is a JavaScript library developed in TypeScript.
A working knowledge of JavaScript will be required to make the most of this manual.
Example code is provided in JavaScript.

## Session Management

* `login(options)` - Log in. `options` are:
  - `name` - `string`, the name of the user you are logging in with.
  - `password` - `string`, the password to attempt to establish a session with.
* `resume(session_token) - Log in again with the token from a previous successful `login()`.

## User Operations

## File System Operations
