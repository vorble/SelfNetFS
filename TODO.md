# TODO

## Next Version Features

* Better path sanity checks (no `:`).
* Sanity checks for user names in useradd and usermod. Also password.
* Think about adding a feature where an admin user can connect as another user easily
  (from a Session, make a new Session as the other user).
* For the server, have the program take an environment variable, configuration
  option, or argument to specify the port number to listen on.

## Monorepo Refactoring

* [ ] Deep review each package.json file for consistency.
* [ ] Deep review each tsconfig.json file for consistency.
* [ ] Deep review each gitignore file for consistency.
* [ ] Deep review each npmignore file for consistency.
* [ ] Figure out how lerna manages propagating package version numbers through the project. Does it even?
* [ ] Write basic test that starts a server and runs some requests against it.
* [ ] Revise naming all through the project.
* [ ] Add appropriate typescript dependencies per package in project.

---

Idea for restructuring: turn `OnwerPool` into the persist layer. The pluggable persist
layer will produce generic `SNFS` objects for use by the `Server` class.
