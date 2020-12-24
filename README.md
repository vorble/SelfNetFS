# selfnetfs

A file system for browser applications.

## Example

The following is a simplistic example of this library's usage that outlines authentication,
writing a file, and reading a file.

```javascript
let api = new SNFSHttp();
let ses = null;
let fs = null;

async function startup() {
  try {
    ses = api.login({
      api_root: 'https://selfnetfs-api.home.arpa/keith',
      name: 'guest',
      password: 'password',
    });
    fs = await ses.fs();
  } catch (err) {
    // Do something appropriate with the error.
    ses = null;
    fs = null;
  }
}

async function save() {
  const data = 'Data from some place. Note: this is a string.';
  try {
    // A directory does not need to be present to add files
    // to it. A string must be text-encoded first since the
    // library requires a Uint8Array.
    await fs.writefile('/path/to/my/file', new TextEncoder().encode(data));
  } catch (err) {
    // Do something appropriate with the error.
  }
}

async function load() {
  try {
    const result = await fs.readfile('/path/to/my/file');
    const data = new TextDecoder().decode(result.data);
    // Do something with the data.
  } catch (err) {
    // Do something appropriate with the error.
  }
}
```

An alternative startup logic that resumes a session from a previous page load
might look like this:

```javascript
let api = new SNFSHttp();
let ses = null;
let fs = null;

async function startup() {
  let api_root = localStorage.getItem('snfs_api_root');
  const pool = localStorage.getItem('pool');
  if (api_root != null && pool != null) {
    try {
      ses = await api.resume(api_root, pool);
      fs = await srs.fs();
      return;
    } catch(err) {
      // Do something appropriate with the error.
      ses = null;
      fs = null;
      localStorage.removeItem('snfs_api_root');
      localStorage.removeItem('pool');
    }
  }
  try {
    api_root = 'https://selfnetfs-api.home.arpa/keith';
    ses = api.login({
      api_root,
      name: 'guest',
      password: 'password',
    });
    localStorage.setItem('snfs_api_root', api_root);
    localStorage.setItem('pool', pool);
    fs = await ses.fs();
  } catch (err) {
    // Do something appropriate with the error.
    ses = null;
    fs = null;
  }
}
```

I encourage you to look at the source file [lib/snfs.ts](/lib/snfs.ts) for
a more complete listing of the methods and classes available when using the
library. Additional methods and fields are outlined in
[browser/http.ts](/browser/http.ts) (i.e. `ses.pool` which you need if you
want your web application to remain logged-in between page loads).

## Running the Shell/Tests

Because of the current state of browser security, testing this library
requires an involved setup (unless you already have stuff in place for HTTPS or
unless your browser considers http://127.0.0.1/ a secure host). The details for
how to do most steps should be familiar to you if you're familiar with running
web servers and familiar with NodeJS.

* Install libraries with `npm install`.
* Build the browser library by running `npm run build`.
  This will produce the file `dist/selfnetfs.js` which you
  can `<script src="...">` include into your page.
* Bootstrap a new database by running the server with
  the `--init` flag:
  `ts-node server/index.ts --init ownername username password`.
  Be sure to clear you shell history (or `unset HISTFILE` if you're using bash)
  to ensure the password isn't in your history.
* Run the server with the command `npm run start` (listens on port 4000).
* Serve the example www assets with `npm run www` (listens on port 4001, requires `python3`).
* Have `selfnetfs-ui.home.arpa` point to `127.0.0.1` in `/etc/hosts`.
* Have `selfnetfs-api.home.arpa` point to `127.0.0.1` in `/etc/hosts`.
* Set up nginx to serve both `.home.arpa` addresses with a valid SSL certificate (I self
  signed mine and trusted it in my browser).
  - Reverse proxy `selfnetfs-api.home.arpa` to `127.0.0.1:4000`.
  - Reverse proxy `selfnetfs-ui.home.arpa` to `127.0.0.1:4001`.
* Navigate your browser to `https://selfnetfs-ui.home.arpa/shell.html` or
  `https://selfnetfs-ui.home.arpa/test.html`.
* In the shell, the command `help` lists the available commands.

## Notes

The following are notes to be integrated into a better setup
guide:

```
openssl ecparam -name secp256k1 -genkey -noout -out sestoken.pem
```
