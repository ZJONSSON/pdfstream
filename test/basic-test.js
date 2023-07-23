/* eslint-disable no-undef */
const { createReadStream } = require('fs');
const PdfStream = require('../index');
const path = require('path');
const t = require('tap');

t.test('merges two pdf files', async () => {
  const pdfStream = new PdfStream();
  const file1 = createReadStream(path.resolve(__dirname, './test.pdf'));
  await pdfStream.append(file1,{ name: 'file1' });
  const file2 = createReadStream(path.resolve(__dirname, './test2.pdf'));
  await pdfStream.append(file2, { name: 'file2' });
  await pdfStream.finalize();
});

