/* eslint-disable no-undef */
const { createReadStream } = require('fs');
const PdfStream = require('../index');
const path = require('path');
const t = require('tap');

t.test('merges two pdf files', async t => {
  const pdfStream = new PdfStream();
  const file1 = createReadStream(path.resolve(__dirname, './test.pdf'));
  await pdfStream.append(file1,{ name: 'file1' });
  const badFile = createReadStream(path.resolve(__dirname, '../README.md'));
  await pdfStream.append(badFile, { name: 'badfile'})
    .then(
      () => { throw new Error('Non-pdf file should error');},
      (e) => { t.equal(e.message, 'File badfile is not a zip file'); }
    );
    
  const file2 = createReadStream(path.resolve(__dirname, './test2.pdf'));
  await pdfStream.append(file2, { name: 'file2' });
  await pdfStream.finalize();
});

t.test('appending multiple file fails', async t => {
  const pdfStream = new PdfStream();
  const file1 = createReadStream(path.resolve(__dirname, './test.pdf'));
  pdfStream.append(file1,{ name: 'file1' });
  const file2 = createReadStream(path.resolve(__dirname, './test2.pdf'))
  pdfStream.append(file2, { name: 'file2' })
    .then(
      () => { throw new Error('Non-pdf file should error');},
      (e) => { t.equal(e.message, 'Previous append has not finished'); }
    );

})

