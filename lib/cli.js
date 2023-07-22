#! /usr/bin/env node
const { createReadStream } = require('fs');
const minimist = require('minimist');
const PdfStream = require('./index');
const path = require('path');
const process = require('process');

const argv = minimist(process.argv.slice(2));
const filenames = argv._;

async function main() {
  const pdfStream = new PdfStream();
  pdfStream.setMaxListeners(1000);
  pdfStream.pipe(process.stdout);
  for (let i = 0; i < filenames.length; i++) {
    try {
      const filename = filenames[i];
      console.error('Adding', filename);
      const file = createReadStream((path.resolve('./',filename)));
      await pdfStream.append(file, filename);
    } catch(error) {
      console.error(error);
    }
  }
  await pdfStream.finalize();
  console.error('Done');
}

main();