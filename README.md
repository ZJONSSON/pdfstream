## PdfStreamer

PdfStream is an experimental class that streams multiple pdf files into a single pdf file.   Unlike most pdf utilities, PdfStream does not try to decode each incoming pdf file into an object tree. In fact,  PdfStream never has access to the entire pdf buffer. Instead, PdfStream watches for object definitions on a streaming basis in each incoming file and pushes every definition to the output stream,  modifying object ids and indirect object references along the stream to ensure they are unique.    PdfStream keeps track of all object pointer locations, and when the output stream is finalized,  a complete xref table is written, along with a new catalog and a bookmark section.

TODO:
* Encrypted files do not work (pages either blank or missing). In cases where the encryption block is ahead of encrypted content, we should attempt decrypting
* read xref tables from the input files to ensure deleted pages are not included in the output


PdfStream class has two methods:

### `.append(stream, { name?: string })`
An async method that starts streaming the input stream into the pdfStream.   When the input file has been fully absorbed, the await is resolved. Only one input file can be appended at a time.
An optional `name` argument will create a bookmark in the resulting pdf stream.

### `.finalize()`
This method should be called when all input files have been fully appended into the stream.    Finalize adds outline (bookmarks), catalog, and xref table to the pdfStream and closes it.

Usage example:

```js
const PdfStream, = require('pdfstream');
const pdfStream = new PdfStream();
pdfStream.pipe(fs.createWriteStream('output.pdf'));
await pdfStream.append(fs.createReadStream('file_1.pdf', 'first file'));
await pdfStream.append(fs.createReadStream('file_2.pdf', 'second file'));
await pdfStream.finalize();
```

## CLI

This package comes with a cli which can be handy if the module is installed globally (npm install -g pdfstream). Supply pdfstream with a list of filenames as arguments and pipe the output to any destination.

Usage example:
```
pdfstreamer file1.pdf file2.pdf file3.pdf > output.pdf
```