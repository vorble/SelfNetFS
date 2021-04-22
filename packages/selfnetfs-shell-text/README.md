# selfnetfs-text-shell

## Design

Want to have the ability to be connected to many owners, sessions, and file systems concurrently.

I'm not a huge fan of switching between sessions in this way:

```
> session new
newsession> session
newsession
newsession> session new
newsession2> session
newsession
newsession2
newsession2> session go newsession
```

It would be cool if file systems could be unioned/mounted wherever and the shell provides a virtual
directory structure. However the union-style file system aggregation makes this not advisable since
you would have two different methodologies expressed in the "file system" as the user views it. E.g.
if you have 3 file systems unioned together and mounted at `/someplace` and you mount a fourth
file system that contains a `/someplace` at `/` then where should the writes to `/someplace` go?

The way it would work in my mind is that you would have some identifier for your file system and
reference the file system and path in that file system explicitly like: `pool1:/someplace`.
You could have an implicit "pool" too so you could easily work with a single file system.

Workflow as I see it:

```
> connect http://someplace/owner
Username: ...
Password: ***
bigdata+> ls /    # The + indicates there are more than one file system being looked at.
dir/
dir2/
.config
file
file2
file3
bigdata+> fs
bigdata+
  bigdata wr 00000000-0000-0000-0000-000000000000
  shared  -r 00000000-0000-0000-0000-000000000001
bigdata+> fslist
bigdata wr 00000000-0000-0000-0000-000000000000
shared  wr 00000000-0000-0000-0000-000000000001
another wr 00000000-0000-0000-0000-000000000002
info    -r 00000000-0000-0000-0000-000000000003
bigdata+> fsget another -u shared
another+> ls
.config
some_other_data
another+> fs
another+
  another wr 00000000-0000-0000-0000-000000000002
  shared  -r 00000000-0000-0000-0000-000000000001
bigdata+
  bigdata wr 00000000-0000-0000-0000-000000000000
  shared  -r 00000000-0000-0000-0000-000000000001
```
