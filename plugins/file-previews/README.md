# Common File Previews

Select a file and press **Space**, or use **Preview** from the file browser or Quick Access.
The same action opens local or connected SSH files. No session IDs or runtime setup are needed.

- Images: PNG, JPEG, GIF, WebP, BMP, ICO and AVIF, when supported by the operating system.
- Audio: MP3, WAV, Ogg, Opus, M4A and FLAC with native playback controls.
- Video: MP4, M4V, WebM and MOV with native playback controls. Encoding support depends on the OS.
- PDF: local bundled PDF.js, page navigation, zoom and bounded range loading. Password-protected
  documents should be opened in a PDF application. Interactive scripts/forms are not executed.
- Markdown and text: bounded UTF-8 read-only content; Markdown includes a source toggle.

Install the ZIP or folder with Tunnelde **0.28.0-beta.5 or later**. Preview providers become
available immediately. Removing this package restores the built-in bounded text preview.
If several installed providers support a file, choose one in the preview selector.

This package is declarative and runs no code. It does not require Node, file permissions,
network requests or uploading files. The host reads directly through the selected local file
or authenticated SSH connection. It creates no remote preview copies or home-directory files.

Images are limited to 32 MiB, PDFs to 128 MiB, and text/Markdown to 2 MiB. Media is read in
bounded ranges rather than copied whole into JavaScript memory. Closing a preview revokes
its ticket, cancels pending reads and releases its file/SFTP channel. Source files are read only.

Third-party packages can declare one or more `filePreviews` providers. Renderers are selected
from the host's `image`, `audio`, `video`, `pdf`, `markdown` and `text` implementations; custom
HTML, scripts, URLs, styles and external viewers are not accepted by this contribution point.
