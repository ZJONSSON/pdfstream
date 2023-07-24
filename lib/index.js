const PullStream =  require('./PullStream');
const Stream = require('stream');
const { Buffer } = require('buffer');
const { inflateSync } = require('zlib');

class PdfStream extends Stream.PassThrough {
  constructor() {
    super(...arguments);
    /** @private @type { number } */
    this.pointer = 0;

    /** @private @type { number } */
    this.delta = 0;

    /** @private @type {boolean} */
    this.ended = true;

    /** @private @type {number[]} */
    this.objMap = [];

    /** @private @type {{ objNum: number, version?: number, name?: string}[] } */
    this.pages = [];

    /** @private @type {{firstPage: number, name: string}[]} */
    this.outline = [];

    /** @private @type { number } */
    this.pageCount = 0;

    /** @type { string | undefined } */
    this._writeBuffer(Buffer.from('%PDF-1.7\n% ����\n'));
  }

  get objectCount() {
    return this.objMap.length-1;
  }

  /** @type {(d: Buffer | string) => Promise<void> } */
  async _writeBuffer(d) {
    d = Buffer.from(d);
    this.pointer += d.length;
    if (!this.write(d)) {
      await new Promise(resolve => this.on('drain', resolve));
    }
  }

  /** @type { (obj: string | Buffer, num?: number, version?: number) => Promise<number> } */
  async _writeObject(obj, num, version) {
    if (num === undefined) {
      num = this.objectCount + 1;
    } 
    this.objMap[num] = this.pointer;
    await this._writeBuffer(`${num} ${version || 0} obj`);
    await this._writeBuffer(obj);
    await this._writeBuffer('endobj\n');
    return num;
  }

  async _writeOutline() {
    const pages = this.outline.filter(d => d.name);
    const outlineObj = this.objectCount + 1;
    let first = outlineObj + 1;
    let last = first + pages.length -1;
    await this._writeObject(`<< /Type /Outlines /First ${first} 0 R /Last ${last} 0 R >>`);
    for (let i = 0; i < pages.length; i++) {
      let pageNum =  first + i;
      let {firstPage, name} = pages[i];
      let next = i < pages.length - 1 ? `/Next ${ pageNum + 1} 0 R ` : '';
      let prev = i > 0 ? ` /Prev ${ pageNum-1} 0 R ` : '';
      await this._writeObject(`\n<< /Parent ${outlineObj} 0 R /Dest [${firstPage} 0 R /Fit] /Title (${name}) ${next}${prev} >>`);
    }
    return outlineObj;
  }

  /** @type { (inbound: Stream.Readable, options?: { name?: string }) => Promise<void> } */
  async append(inbound, options) {
    const name = options && options?.name;
    let firstPage;

    if (!this.ended) throw 'Previous append has not finished';
    this.ended = false;

    const pullStream = new PullStream();
    inbound.pipe(pullStream);

    const firstLine = String(await pullStream.pull('\n',true));
    if (!firstLine.startsWith('%PDF')) {
      this.ended = true;
      pullStream.end();
      throw new Error(`File ${name} is not a zip file`);
    }
    if (name) this._writeBuffer(`% Starting file ${name}\n`);
    
    while (!this.ended) {
      /** @type { Buffer } */
      let body;
      try {
        body = await pullStream.pull(Buffer.from('obj'),true); 
      } catch(error) {
        this.ended = true;
        this.delta = this.objectCount;
        break;
      }

      let objMatch = /([0-9]+)[\s]+([0-9]+)[\s]+(obj)/gm.exec(String(body)); 
      if (objMatch) {
        let objNum = +objMatch[1] + this.delta;
        let version = +objMatch[2];
        body = await pullStream.pull(Buffer.from('endobj'));
        const res = await this.processObject(objNum, version, body, name);
        firstPage = firstPage || res.firstPage;
      }
    }
    if (firstPage) {
      this.outline.push({firstPage, name});
    }
  }
  
  /** @type { (objNum: number, version: number, body: Buffer, name: string | undefined) => Promise<{firstPage?: number}> } */
  async processObject(objNum, version, body, name) {
    let firstPage, re;
    let stream = Buffer.from('');
    let streamLoc = body.indexOf('stream');

    if (streamLoc > 0) {
      stream = body.subarray(streamLoc);
      body = body.subarray(0,streamLoc);
    }

    let obj = String(body);
    let lengthMatch, firstMatch;
    obj = obj.replaceAll(/\/Javascript/ig,'');
    if (
      obj.includes('ObjStm') && 
      (lengthMatch = /\/Length[\s]+([0-9]+)/gm.exec(obj)) &&
      (firstMatch =  /\/First[\s]+([0-9]+)/gm.exec(obj))
    ) {
      const length = +lengthMatch[1];  
      const first = +firstMatch[1];

      // we have to look for the last \n after stream to locate stream start
      stream = stream.subarray(stream.indexOf('stream'));
      stream = stream.subarray(stream.indexOf('\n')+1);
      stream = stream.subarray(0, length);
      stream = inflateSync(stream);

      const referenceBuffer = String(stream.subarray(0,first));
      const data = stream.subarray(first);

      let re = /[\s]*([0-9]+)[\s]+([0-9]+)/gm;

      let references = [];
      let referenceMatch;
      while ((referenceMatch = re.exec(referenceBuffer))) {
        references.push({objNum: +referenceMatch[1] + this.delta, location: +referenceMatch[2]});
      }
      
      for (let i = 0; i < references.length; i++) {
        let d = references[i];
        const payload = Buffer.concat([Buffer.from('\n'),data.subarray(d.location, references[i+1]?.location || undefined)]);
        const res = await this.processObject(d.objNum, 0, payload, name);
        firstPage = firstPage || res.firstPage;
      }
    }
    
    if (obj.includes('/Pages') && !obj.includes('/Parent') && !obj.includes('/Catalog')) {
      let pagesMatch = /\/Count[\s]+([0-9]+)/gm.exec(obj);
      if (pagesMatch && pagesMatch[1]) {
        this.pageCount += (+pagesMatch[1]);
      }
      this.pages.push({objNum, version, name: name});
    } else if (!firstPage && /\/Page[\s/><]/gm.exec(obj)) {
      firstPage = objNum;
    }

    /** @type Buffer[] */
    let out = [];
    
    re =  /([0-9]+)[\s]+([0-9]+)[\s]+(R)/gmd;

    let last = 0, indirectMatch;
    while ( (indirectMatch = re.exec(obj)) && indirectMatch.indices) {
      out.push(Buffer.from(obj.slice(last,indirectMatch.indices[0][0])));
      out.push(Buffer.from(`${+indirectMatch[1] + this.delta} ${indirectMatch[2]} R`));
      last = indirectMatch.indices[3][1];
    }
    out.push(Buffer.from(obj.slice(last)));
    out.push(Buffer.from(stream));
    await this._writeObject(Buffer.concat(out),objNum, version);
    return { firstPage };
  }

  /** @type { () => Promise<void> } */
  async finalize() {
    let pages = await this._writeObject(`
      << /Type /Pages
        /Kids [${this.pages.map(d => d.objNum+' '+d.version+' R').join(' ')}]
        /Count ${this.pageCount}
      >>`);

    let outline = await this._writeOutline();
    
    let catalog = await this._writeObject(`
      <</Type /Catalog
        /Pages ${pages} 0 R
        /Outlines ${outline} 0 R
      >>`);

    const startXref = this.pointer;
    await this._writeBuffer(`xref\n0 ${this.objectCount+1}\n`);
    for (let d of this.objMap) {
      if (d == undefined){
        this._writeBuffer('0000000000 65535 f\n');
      } else {
        this._writeBuffer(String(d).padStart(10, '0')+' 00000 n\n');
      }
    }

    await this._writeBuffer(`trailer<< /Root ${catalog} 0 R /Size ${this.objectCount+1}>>\nstartxref\n${startXref}\n%%EOF`);
    this.end();
  }
}

module.exports = PdfStream;