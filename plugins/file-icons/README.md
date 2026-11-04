# Common File Icons

Recognize source code, documents, archives, media and configuration files at a glance.
Language badges use familiar abbreviations and colors; format glyphs are rendered by Tunnelde.
These are identification aids, not official company logos.

Requires Tunnelde with `fileIconThemes` support. Install the ZIP or folder through Plugins;
Automatic selects an available icon theme. Choose **Settings → Files → File icon theme**,
or open this package's details and select **Apply theme** to choose it explicitly.
Choose **Plain file icons** to turn it off. Removing the package restores ordinary file glyphs.

The same mapping applies to local files, remote files, every file-browser view, editor tabs
and Quick Look. Exact filenames take priority, followed by the longest matching extension
(such as `tar.gz`) and then shorter suffixes. Matching is case-insensitive.

This is a declarative theme package: no Node, commands, filesystem access or permissions.
It never opens or uploads your files and does not download icons. Glyphs and optional short
labels are rendered by the application, without scripts, external URLs or arbitrary SVG.

Third-party plugins can contribute one or more themes through `fileIconThemes`; see the
application's plugin API documentation for the schema and bounded field validation.
