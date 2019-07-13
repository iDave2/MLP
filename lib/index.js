/**
 *  Named in honor of MNIST training data format, this class
 *  encapsulates its usage.  See http://yann.lecun.com/exdb/mnist/.
 */
'use strict'
const assert = require('assert')
const fs = require('fs')

/**
 *  # MNIST IDX data file format
 *
 *  This class encapsulates the Modified National Institute of Standards
 *  and Technology ([MNIST](http://yann.lecun.com/exdb/mnist/)) database
 *  format, also called the IDX file format.  "IDX" may mean "index;"
 *  author does not know; it is an ancient mystery.
 *
 *  In the context of this class, define the following terms:
 *    - **header**: database header, magic plus dimension sizes
 *    - **body**: everything after the header, the actual images or labels
 *    - **data**: synonym for **body** when considered as an array of its
 *      smallest pieces &mdash; bytes, words, or floats &mdash; whose
 *      datatype is given by the third byte of header magic
 *    - **elements**: the equal-sized body slices obtained by dividing
 *      total body length by size of first dimension; that is, the size
 *      of the first dimension may also be viewed as the number of
 *      elements in the database
 *
 *  For a database of one dimension, the element size is one byte.
 *  For a database of multiple dimensions, the element size is the
 *  product of dimension sizes for all dimensions except the first.
 *  So for a database of greyscale images, where one byte represents
 *  one pixel, the element size is just the image area in bytes.
 *
 *  While the code for this class includes suggestions for different
 *  MNIST data types, only raw bytes are currently supported.  Larger
 *  types might require endian filters (with associated overhead).
 *
 *  @example
 *    const index = new Index(path)
 *    index.reader
 *      .on('data', chunk => doSomething(chunk) )
 *      .on('end',  ()    => doSomethingElse()  )
 */
class Index {

  // Looking forward to completion of JavaScript field notation.
  // It is a bit tricky keeping track of the this.xyz's below...

  /**
   *  Method constructs a new IDX which, by default, includes the entire
   *  body.  To view only a portion of the database, provide `begin` and
   *  optional `count` values.  When only a `begin` element is specified,
   *  `count` will include all elements from `begin` to end of database.
   *
   *  @param {string} path Path to an MNIST IDX file
   *  @param {number} begin Offset in *elements* to begin reading from
   *  @param {number} count Number of *elements* to include
   */
  constructor(path, begin = 0, count = null) {

    // console.log(`*****\nnew IDX: begin ${begin}, count ${count}`)

    // Check existence, remember file stats.

    const fd = fs.openSync(this.path = path, 'r')
    this.stats = fs.fstatSync(fd)

    // Setup bag for various sizes to emphasize 'size' means various things.

    this._size = {
      data: NaN,      // One physical pixel (or label datum).
      header: NaN,    // Magic (data type + #axes) + dimension sizes.
      element: NaN,   // One complete image (or label).
    }

    // Read magic number for datatype code and number of dimensions.

    const magicSize = 4
    let buffer = Buffer.alloc(magicSize)
    if (magicSize !== fs.readSync(fd, buffer, 0, magicSize))
      throw new Error(`Error reading magic from "${this.path}"`)
    const typeCode = buffer[2]
    const numAxes = buffer[3]
    assert(numAxes > 0, `Expected positive number of dimensions, got ${numAxes}`)

    // Setup data element size and type.

    switch (typeCode) {
      case 0x08:  // unsigned byte
        this._size.data = 1, this.dataType = Uint8Array
        break
      case 0x09:  // signed byte
        this._size.data = 1, this.dataType = Int8Array
        break
      case 0x0B:  // short (2 bytes)
        this._size.data = 2, this.dataType = Int16Array   // No Uint16Array?
        break
      case 0x0C:  // int (4 bytes)
        this._size.data = 4, this.dataType = Int32Array   // No Uint32Array?
        break
      case 0x0D:  // float (4 bytes)
        this._size.data = 4, this.dataType = Float32Array
        break
      case 0x0E:  // double (8 bytes)
        this._size.data = 8, this.dataType = Float32Array
        break
      default:
        throw new Error(`Unknown data type "0x${typeCode}"`)
        break
    }

    // Read size of each dimension.

    let dimSize = 4, bufferSize = dimSize * numAxes
    buffer = new ArrayBuffer(bufferSize);
    let view = new DataView(buffer)
    if (bufferSize !== fs.readSync(fd, view, 0, bufferSize))
      throw new Error(`Error reading dimensions from "${this.path}"`)
    this.dims = []
    for (let i = 0; i < numAxes; ++i)
      this.dims.push(view.getUint32(i * dimSize))

    this._size.header = magicSize + bufferSize
    this._size.element = this.dims.slice(1).reduce((a, c) => a * c, 1)
    let bodySize = this.dims[0] * this._size.element
    let totalSize = this._size.header + bodySize
    assert(totalSize === this.stats.size,
      `Expected ${this.stats.size} bytes, got ${totalSize}`)

    // Vacuum.

    fs.close(fd, (err) => { /*ignore*/ })
  }

  /**
   *  Method returns string representing dimensions of this index.
   *  For example, "60000 x 28 x 28".
   *
   *  @returns {string} formatted representation of dimensions
   */
  get dimString() {
    return this.dims.reduce((acc, cur) => '' + acc + ' x ' + cur)
  }

  /**
   *  Method returns a Node.js `stream.Readable` over the window or
   *  slice of this index given by element indices `[begin, begin + count)`.
   *
   *  Input parameters have defaults `begin=0` and `count=null` so that,
   *  if you just say `getReader()`, your reader will read the entire
   *  Index.
   *
   *  @param {number} begin starting element index to read from,
   *    defaults to '0'
   *  @param {number} count number of elements to read, defaults to
   *    the number of elements from `begin` to end of database
   */
  getReader(begin = 0, count = null) {

    // Validate requested element window, if any.

    // const elementSize = this._size.element
    // const numElements = bodySize / elementSize
    // const availElements = numElements - begin

    assert(0 <= begin && begin < this.length,
      `begin index "${begin}" out-of-bounds`
      + `, set in half-open range [0, ${this.length})`)

    // console.error(`new Index: count is ${count}, !count is ${!count}`
    //   + `, count === null = ${count === null}`
    //   + `, availElements is ${availElements}`)

    let maxCount = this.length - begin
    if (count === null) count = maxCount
    assert(0 < count && count <= maxCount,
      `count out of bounds; for begin = ${begin}`
      + `, try count in [1, ${maxCount}]`)

    // Reader options 'start' and 'end' effectively perform a
    // "seek" and "clamp" on big MNIST database index.

    if (this.reader) this.reader.destroy()

    const start = this._size.header + begin * this._size.element
    const end = start + count * this._size.element
    return this.reader = fs.createReadStream(this.path, {
      start: start,
      end: end - 1, // "Both start and end are inclusive..."
      /*
        File streams with small highWaterMarks exhibit visually stunning
        degradation.  Unless you are testing something, do not modify
        highWaterMarks casually.  These really do change size of stream's
        internal buffer and there is no "smart background buffer" that
        prevents this.
      */
      // highWaterMark: this.dims.slice(1).reduce((a, c) => a * c, 1),
      // highWaterMark: 11,
    })
  }

  /**
   *  Method returns number of elements in this database index.
   *
   *  @returns {number} number of elements in this index
   */
  get length() {
    return this.dims[0]
  }

  /**
   *  This method returns the size in bytes one *element* (image or
   *  label) as described in {@link Index}.  (Links don't appear
   *  to work in this vscode jscode formatter so go read documentation
   *  on main Index class declaration above.)
   *
   *  @returns {number} size of one element
   *
   *  @example
   *    console.log(index.size)
   *    // Expect 20 x 30 = 60 bytes for a database
   *    // with dimensions 40,000 x 20 x 30
   */
  get size() {
    return this._size.element
  }
}

module.exports = Index