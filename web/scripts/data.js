/********************************************************************
 *
 *  Image processing for MNIST environment.  This initial effort
 *  uses XMLHttpRequest and that is retained for posterity.  Newer
 *  packages will use newer Fetch API.
 *
 *  @see https://stackoverflow.com/questions/25520410
 *  when-setting-a-font-size-in-css-what-is-the-real-height-of-
 *  the-letters
 *
 *******************************************************************/

'use strict'

/*
 *  Debugging aid, a bitmap that activates:
 *
 *    0x01 - log XHR activity
 *    0x02 - draw text grids
 *    0x04 - watch setDatabase()
 *    0x08 - watch State.add() (noisy)
 *    0x10 - watch scroll fetching (prepend, append)
 *    0x20 - watch scroll position (noisy)
 *    0x40 - dump current state on click Go
 *    0x80 - watch countHint() and its computation
 */
const debug = 0x00

// MNIST databases on server.  getDatabase() loads this
// at startup and comments below show what it will look like.

let database = null // {
//   training: {
//     table: 'training',
//     length: NaN,     // Number of elements in database.
//     width: NaN,      // Width of one image (in bytes).
//     height: NaN,     // Height of one image (in bytes).
//   },
//   testing: {
//     table: 'testing',
//     length: NaN,     // Number of elements in database.
//     width: NaN,      // Width of one image (in bytes).
//     height: NaN,     // Height of one image (in bytes).
//   }
// }
let dbTable = null      // Active scrollbar database table.

// Webpage #data widgets.

let container = null    // Element container (canvases).
let indexInput = null   // Text box for database index (goto).
let dbSelector = null   // Database selector (training, testing).

/********************************************************************
 *
 *  Transforms to clarify or obfuscate three coordinate systems:
 *
 *  - Database: element index **dx** in [0, 60000), many thousands
 *    of elements;
 *
 *  - Scroll buffer: container offset **sx** in pixels [0, scrollWidth)
 *    across width of buffered elements, two or more times wider
 *    than pixels displayed in client area;
 *
 *  - Client area: the visible portion, **cx** in [0, client.width),
 *    of scroll buffer, a few hundred pixels.
 *
 *  Consider a database with 60,000 elements, a scroll buffer 3,000
 *  pixels wide holding elements with database indices `begin` to
 *  `begin + count`, and client area with 800 pixels.  It is helpful
 *  to remember what domain -> range looks like in this case,
 *  ```javascript
 *    dx2sx: [begin, begin + count) -> [0, 3000);
 *    sx2dx: [0, 3000) -> [begin, begin + ccount);
 *    sx2cx: [scrollLeft, scrollLeft + clientWidth) -> [0,  800)
 *    cx2sx: [0, 800) -> [scrollLeft, scrollLeft + clientWidth]
 *  ```
 *  This works with modern browsers where client area is actually
 *  two views:
 *
 *    1.  The elements scrolling by with their canvases of digit,
 *        label, and database index;
 *    1.  The scrollbar whose "thumb" or "scroller" (or "knob" or ...)
 *        represents the portion of scroll buffer currently viewed in
 *        (1) and whose entire content represents a scaled view of
 *        entire buffer.  This is the view mapped by **sx2cx** and
 *        **cx2sx**.
 *
 *  A mapping for client view (1) would be the simple translation,
 *  ```javascript
 *    sx = scrollLeft + cx
 *  ```
 */
let dx2sx = (dx) => (dx - CS.begin) * CS.sw_dw
let sx2dx = (sx) => CS.begin + sx * CS.dw_sw
let sx2cx = (sx) => sx * CS.cw_sw
let cx2sx = (cx) => cx * CS.sw_cw
/*
 * Miscellaneous helpers.
 */
const flote3 = x => Math.round(1000 * x) / 1000

/********************************************************************
 *
 *  This class models a live data container, the scrollable
 *  list of contiguous loaded elements, as a queue.
 */
class State {

  constructor() {  // Call refresh() after load to initialize.

    this._begin = NaN   // Index (int) of first element.

    this._length = NaN  // Buffer size in elements.

    // Common transform factors.

    this.dw_sw = NaN    // database width (element count) / scroll width
    this.sw_dw = NaN    // inverse of dw_sw
    this.sw_cw = NaN    // scroll width / client width
    this.cw_sw = NaN    // inverse of sw_cw

    // Thresholds used to trigger a fetch for more data while scrolling.

    this.bias = {
      throw: NaN,
      catch: NaN,
      threshold: {
        throw: 0.2,
        catch: 0.3,     // Keep this larger than threshold.throw.
      }
    }
  }

  /**
   * Getter returns index of first database element in scroll buffer.
   */
  get begin() {
    return this._begin
  }

  /**
   * Setter sets index of first element in scroll buffer.
   */
  set begin(newBegin) {

    // NaN is used Only when buffer is empty.

    if (isNaN(newBegin)) {
      if (this.count !== 0)
        throw new Error(`Attempt to set begin = NaN on nonempty buffer!`)
    } else {
      newBegin = State.validateIndex(newBegin)
    }
    this._begin = newBegin
  }

  /**
   *  **State.count** returns the live count of the number of
   *  elements in scroll buffer while **State.length** sets a
   *  maximum buffer size.
   */
  get count() {
    return container.childElementCount
  }

  /**
   *  Method returns suggestion for number of elements to buffer
   *  based on a given **goal** which can be,
   *
   *  - **smaller**: minimize memory usage
   *  - **faster**: use larger buffer for smoother scrolling
   *  - **nominal**: a default count
   *
   *  To set buffer size manually, use
   *  ```
   *  CS.length = numberOfElements
   *  ```
   *
   *  ## Scrollbar Algebra
   *
   *  When buffer is too small, say buffer contains only one element,
   *  then client area does not have enough elements to scroll.  You
   *  see the first element displayed and that's that.
   *
   *  When buffer is very large, scrolling is mahvelous but you may
   *  waste memory.
   *
   *  In between, there is a buffer size that uses the least memory
   *  yet still provides a friendly UI.  It is fun to compute an
   *  initial value for this buffer size at program startup, before
   *  elements are loaded and exact widths are known.  To that end,
   *  define the following variables:
   *
   *  - ew, element width, canvas width + margin is close, known;
   *  - ww, window width, known;
   *  - cw, client width, if unknown use ww;
   *  - sw, scroll width, unknown;
   *  - hw = sw - cw, hidden width, unknown;
   *  - bt = tt * hw, bias.throw, unknown;
   *  - bc = tc * hw, bias.catch, unknown;
   *  - tt, bias.threshold.throw, like 0.2, known;
   *  - tc, bias.threshold.catch, like 0.3, known;
   *  - n = sw/ew, minimum number of elements, unknown.
   *
   *  Now choose a definition for "friendly UI:"
   *
   *  1. User can scroll at least the width of one element before
   *     bias "throws" scroller back and initiates another fetch;
   *
   *  1. If user reverses scroll direction immediately after
   *     triggering bias try/catch sequence, user is still able
   *     to scroll (in opposite direction now) at least one element.
   *
   *  This gives two requirements:
   *  ```
   *    bt >= ew;
   *    bc >= 2 * ew.
   *  ```
   *  Substituting expressions above and simplifying,
   *  ```
   *    bt = tt * hw = tt * (sw - cw) >= ew.
   *    bc = tc * hw = tc * (sw - cw) >= 2 * ew.
   *
   *    sw >= cw + ew/tt
   *    sw >= cw + 2 * ew/tc
   *
   *    sw >= cw + ew * max(1/tt, 2/tc)
   *
   *    n = sw/ew >= cw/ew + max(1/tt, 2/tc)
   *  ```
   *  This provides a reasonable value for **n**, the minimum
   *  number of elements to buffer and retain a friendly UI.
   *
   *  @param {string} goal type of count desired, default is **nominal**
   */
  countHint(goal = 'nominal') {

    if (this.length) return this.length

    if (debug & 0x80)
      console.groupCollapsed(`countHint('${goal}')`)

    // Use canvas width for element width.  Canvases are 86px
    // with a 2px right margin.

    const ew = 88
    if (debug & 0x80)
      console.debug(`element width (ew) = ${ew}`)

    // Try to get a container width (author had trouble with this);
    // else, use window width.

    let cw = null
    {
      let cw1 = container.clientWidth
      if (!cw && cw1) cw = cw1
      let cw2 = window.getComputedStyle(container).width
      if (!cw && cw2) cw = cw2.replace('.px', '')
      let cw3 = window.innerWidth
      if (!cw && cw3) {
        const guessSpace = 32 // Also two 1em paddings...
        cw = cw3 > guessSpace ? cw3 - guessSpace : cw3
      }
      if (debug & 0x80) {
        console.debug(`container.clientWidth = ${cw1}`
          + `\ncomputed container width = ${cw2}`
          + `\nwindow inner width = ${cw3}`
          + `\ncontainer width (cw) = ${cw}`)
      }
    }

    const tt = this.bias.threshold.throw, tc = this.bias.threshold.catch
    const _1_tt = 1 / tt, _2_tc = 2 / tc
    const max_1_tt_2_tc = Math.max(_1_tt, _2_tc)
    if (debug & 0x80) {
      console.debug(`1 / threshold.throw (1/tt) = ${flote3(_1_tt)}`
        + `\n2 / threshold.catch (2/tc) = ${flote3(_2_tc)}`)
    }

    // n = sw/ew >= cw/ew + max(1/tt, 2/tc)

    const minFloat = cw / ew + max_1_tt_2_tc
    const minCount = Math.ceil(minFloat)
    if (debug & 0x80) {
      console.debug(`minFloat = ${flote3(minFloat)}`
        + `\nminCount (n) = ${minCount}`)
    }
    const n = minCount
    if (debug & 0x80) {
      // n * ew - 2 = n * (ew - 2/n)
      let sw = n * ew   // >= cw + ew * max_1_tt_2_tc
      sw -= 2           // No right margin on last element.
      const hw = sw - cw
      const bias = { throw: tt * hw, catch: tc * hw } // scroll space
      const bt_s = tt * hw, bc_s = tc * hw
      const cw_sw = cw / sw // Fake sx2cx(sx), CS.cw_sw unavailable.
      const bt_c = bt_s * cw_sw, bc_c = bc_s * cw_sw
      console.log(
        `sw = ${flote3(sw)}, hw = ${flote3(hw)}, cw/sw = ${flote3(cw_sw)}`
        + `\nbias[throw, catch] (scroll) = [${flote3(bt_s)}, ${flote3(bc_s)}]`
        + `\nbias[throw, catch] (client)`
        + ` = [${flote3(bt_c)}, ${flote3(bc_c)}]`
      )
    }

    const fasterCount = 5 * minCount
    const nominalCount = 2 * minCount

    if (debug & 0x80)
      console.groupEnd()

    switch (goal) {
      case 'smaller':
        return minCount
      case 'faster':
        return fasterCount
      case 'nominal':
        return nominalCount
    }
    return nominalCount
  }

  /**
   *  "Focus" getter in this context returns the database index
   *  (floating) that corresponds to the left edge of client area.
   *
   *  @returns {number} index of element with current focus
   */
  get focus() {
    return sx2dx(container.scrollLeft)
  }

  /**
   *  Focus setter sets focus to the given index, clamping if
   *  index lies outside currently buffered elements.
   *
   *  VSCode JSDoc extension, on the other hand, slams together
   *  this getter and setter documentation at time of writing.
   *  Apologies.
   *
   *  @param {number} newFocus index of element that will receive focus
   */
  set focus(newFocus) {
    if (this.has(newFocus))
      container.scrollLeft = dx2sx(newFocus)
  }

  /**
   *  Method answers "Does live data include this element index?"
   *  Note that index is a float when referring to offsets into
   *  pixel buffers.
   *
   *  @param {number} index database offset to check
   *  @returns true iff container includes this index
   */
  has(index) {
    return this.begin <= index && index < this.begin + this.count
  }

  /**
   *  **State.count** returns the live count of the number of
   *  elements in scroll buffer while **State.length** sets a
   *  maximum buffer size.
   */
  get length() {
    return this._length
  }

  set length(numElements) {
    try {
      numElements = parseInt(numElements)
    } catch (err) {
      console.error(`Invalid numElements (${numElements}): ${err}`)
      numElements = this.countHint()
    }
    numElements = Math.round(Math.max(1, numElements))
    this._length = numElements
  }

  /**
   *  Call `State.refresh` after fetching data to reinitialize
   *  parameters that depend on currently loaded data.
   */
  refresh() {

    if (this.count === 0) return

    // Common ratios for converting between coordinate systems.

    this.dw_sw = this.count / container.scrollWidth
    this.sw_dw = container.scrollWidth / this.count
    this.sw_cw = container.scrollWidth / container.clientWidth
    this.cw_sw = container.clientWidth / container.scrollWidth

    // Catch should exceed throw; else, system oscillates.

    const hiddenWidth = container.scrollWidth - container.clientWidth
    this.bias.throw = this.bias.threshold.throw * hiddenWidth
    this.bias.catch = this.bias.threshold.catch * hiddenWidth
  }

  /**
   *  This method checks the following conditions:
   *
   *  - `index` may be parsed to an integer
   *  - `0 <= index < dbTable.length`
   *
   *  If all tests pass, method returns `floor(index)`,
   *  a nearest integer, which caller should use for
   *  container position.  If any test fails, an exception
   *  is thrown.
   *
   * @param {number} index index to validate
   * @returns {integer} floor of index when valid; else, exception
   */
  static validateIndex(index, clamp = false) {

    // Convert strings here and hope callers use return value.
    // This will crash or return an integer.

    let int = parseInt(index, 10)

    // If database not yet set, fake it.

    const limit = dbTable.length ? dbTable.length : Infinity

    // Clamp data if requested (looser validation).

    if (clamp)
      int = Math.max(0, Math.min(int, limit - 1))

    // On success, floor potential float.

    if (0 <= int && int < limit)
      return int

    // On fail, kablooey.

    throw RangeError('Invalid index (' + index + ');'
      + ' try something in half-open interval [0, ' + limit + ')')
  }

  ///// METHODS FOR ELEMENT ADDITION AND REMOVAL ////////////////////

  /**
   *  Method adds new canvas to collection.  If container already
   *  has a canvas with this index, request is ignored.  If new
   *  index is contiguous with existing data, it is appended or
   *  prepended.  If new index lies outside existing data, all
   *  existing data is removed, then new element is added.
   *
   *  @param {*} index  database index of new element
   *  @param {*} canvas new canvas to add
   */
  add(canvas, index) {

    index = State.validateIndex(index)
    if (this.has(index)) {
      console.error(`Container already has index ${index}, cannot add it`)
      return
    }

    if (debug & 0x08) {
      const cs = `CS[${this.begin}, ${this.begin + this.count})`
      console.groupCollapsed(`State.add(canvas, ${index}) to ${cs}`)
    }

    if (this.count === 0) { // empty queue

      if (debug & 0x08) console.debug(`initialize ${index}`)
      this.push(canvas, index)

    } else if (index === this.begin - 1) { // prepend

      if (debug & 0x08) console.debug(`prepend ${index}`)
      while (this.count >= this.length) // remove from right
        this.pop()
      this.unshift(canvas, index) // add to left

    } else if (index === this.begin + this.count) { // append

      if (debug & 0x08) console.debug(`append ${index}`)
      while (this.count >= this.length) // remove from left
        this.shift()
      this.push(canvas, index) // add to right

    } else { // noncontiguous

      if (debug & 0x08) console.debug(`noncontiguous ${index}`)
      while (this.count)
        this.pop() // remove everything
      this.push(canvas, index) // add single new node

    }

    if (debug & 0x08) console.groupEnd()
  }

  // DOM wrappers that present a queue.

  pop() {
    const oldChild = container.lastChild
    container.removeChild(oldChild)
    if (!this.count) this.begin = NaN
    return oldChild
  }

  push(canvas, index = NaN) {
    container.appendChild(canvas)
    if (this.count === 1)
      this.begin = index
  }

  shift() {
    const oldChild = container.firstChild
    container.removeChild(oldChild)
    if (this.count)
      this.begin += 1
    else
      this.begin = NaN
    return oldChild
  }

  /*
   *  This crashed, once, during XHR load, but I cannot reproduce.
   *  Error looked like this:
   *
   *    Uncaught DOMException: Failed to execute 'insertBefore' on
   *    'Node': The node before which the new node is to be inserted
   *    is not a child of this node.
   *      at State.unshift (.../main.js:369:17)
   *      at State.add (.../main.js:321:12)
   *      at XMLHttpRequest.xhr.onload (.../main.js:684:10)
   *
   *  Also see:
   *    https://stackoverflow.com/a/5347062
   *    https://stackoverflow.com/a/2734311
   *    https://developer.mozilla.org/en-US/docs/Web/JavaScript/EventLoop
   *    http://www.erights.org/elib/concurrency/event-loop.html
   *
   *  This was author's error and is fixed but keep the good refs.
   */
  unshift(canvas, index = NaN) {
    if (this.count) {
      container.insertBefore(canvas, container.firstChild)
      this.begin -= 1
    } else {
      container.appendChild(canvas)
      this.begin = index
    }
  }
}

const CS = new State() // The current state, only one so far.

/********************************************************************
 *
 *  Called when page first loads, this method initializes state.
 */
function initData() {

  // Remember where canvas container lives.

  container = document.querySelector('#data .elements')
  container.addEventListener('scroll', onScroll)

  // Remember location of database element offset
  // and its button that loads data at that offset.

  indexInput = document.getElementById('index')
  const goButton = document.getElementById('goButton')
  goButton.addEventListener('click', onClick)

  // Remember Spock.

  dbSelector = document.getElementById('table')
  dbSelector.addEventListener('change', onChange)

  // Load database metadata, then load initial data.

  getDatabase().then(() => {
    onChange()
  })
}

/********************************************************************
 *  **onchange** event handler lets user scroll through
 *  different database tables.
 */
function onChange(event) {
  const table = dbSelector.value.toLowerCase()
  dbTable = database[table]
  /*
   *  Disable onscroll listener; reenable when done.  This STILL does
   *  not work in Chrome circa 190714 but is fine on Safari.
   */
  container.removeEventListener('scroll', onScroll)
  /*
   * Clear out any old data.
   */
  while (CS.count)
    CS.pop()
  /*
   * Set an initial buffer size, at least first time here.
   */
  CS.length = CS.countHint()
  /*
   *  Fetch new data.
   */
  getElements(table).then(finalFocus => {
    indexInput.value = 0
  })
  /*
   * This is lost sometimes after DB change.  Perhaps caused
   * by emptying the container so nothing to scroll?  And
   * remove/add here does not always fix.  Perhaps we must
   * create a new container everytime we change databases?
   * Or postpone subsequent add() until next time slot?
   * BTW, this happens in Chrome, have not reproduced in
   * Safari yet, go Safari.
   */
  container.addEventListener('scroll', onScroll)
}

/********************************************************************
 *  **onclick** event handler for button that takes user to a
 *  given database element index.
 */
function onClick(event) {

  if (debug & 0x40 && CS.count) {
    console.log(`CS: %o`, CS)
  }

  // Validate requested index.

  const index = State.validateIndex(indexInput.value, true)

  // We want input index at left of view.  What is middle index?

  let middleIndex = index + sx2dx(container.clientWidth / 2) - CS.begin
  let begin = Math.round(middleIndex - CS.count / 2)
  let count = CS.count

  // That is the ideal view or range of elements.
  // Clamp it to the available range.

  if (begin < 0)
    begin = 0
  else if (begin + count > dbTable.length)
    begin = dbTable.length - count

  // If nothing can be improved, all we can do is focus on input index.

  if (begin === CS.begin) {
    CS.focus = index
    return
  }

  // Check for overlap of new data onto old.

  let end = () => begin + count - 1
  let prepend = false
  if (CS.begin <= begin && begin < CS.begin + CS.count) {

    count = begin - CS.begin
    begin = CS.begin + CS.count // append a few elements

  } else if (CS.begin <= end() && end() < CS.begin + CS.count) {

    prepend = true
    count = CS.begin - begin // prepend a few elements

  }

  // Run final sanity check and load data.

  if (!(0 <= begin && 0 < count && begin + count <= dbTable.length))
    return

  getElements(dbTable.table, begin, count, prepend)
    .then(finalFocus => {
      CS.focus = index  // Place input index at left of view.
    })
    .catch(err => {
      console.error(`getElements failed, "${err}", ${err.trace}`)
    })
}

/********************************************************************
 *  **onscroll** event handler.
 *
 *  This sometimes disappears (in Chrome, not Safari) after a
 *  database change.  Sketchy reproduction, still not understood.
 */
function onScroll(event) {

  // Workaround for Chrome which does not let us disable event
  // handlers (see onChange()).  If this is called when element
  // container is empty, focus is NaN with associated error msgs.

  if (CS.count === 0) return

  // Database coordinates: elements [begin, begin + count).

  const focus = CS.focus // Update displayed location.
  indexInput.value = Math.round(focus)

  // Scroll coordinates: pixels [0, scroll.width).

  const scroll = {
    left: container.scrollLeft,
    right: container.scrollLeft + container.clientWidth,
    width: container.scrollWidth,
  }

  // Client coordinates: pixels [0, client.width).

  const client = {
    left: sx2cx(scroll.left),       // Left end of thumb.
    right: sx2cx(scroll.right),     // Right side of thumb.
    width: container.clientWidth,
  }

  if (debug & 0x20) { // Lengthy aside ------------------------------

    let message = `scroll: sl/sw = ${scroll.left}/${scroll.width}`

    let percent = 100 * scroll.left / scroll.width
    percent = Math.floor(100 * percent) / 100
    message += ` (${percent}%)`

    // View (client) begin and end index (float).
    // dl/dr emphasizes these are Database indices (foci).

    let dl = Math.floor(100 * sx2dx(scroll.left)) / 100
    let dr = Math.floor(100 * sx2dx(scroll.right)) / 100
    message += `, [dl, dr) = [${dl}, ${dr})`

    console.debug(message)

  } // End lengthy aside --------------------------------------------

  // For rather confusing debugging as length of function suggests.

  const log = function (note, newClient = null) {
    let message = note ? `${note}: ` : '\n'
    const myClient = newClient === null ? client : newClient
    message +=
      `bias throw/catch ${Math.floor(CS.bias.throw)}`
      + `/${Math.floor(CS.bias.catch)} `
      + `, client {${Math.floor(myClient.left)}`
      + `, ${Math.floor(myClient.right)}, ${Math.floor(myClient.width)}}`
      + `, delta (${Math.floor(myClient.left - CS.bias.throw)}`
      + `, ${Math.floor(myClient.width - myClient.right - CS.bias.throw)})`
    console.log(message)
  }

  // When scroller get too close to an edge, it passes CS.bias.throw
  // and is sent back to CS.bias.catch distance from other edge.

  let newScrollLeft = null

  if (scroll.left < CS.bias.throw && 0 < CS.begin) {

    if (debug & 0x10) log('prepend')
    newScrollLeft = scroll.width - client.width - CS.bias.catch

  } else if (scroll.width - scroll.right < CS.bias.throw
    && CS.begin < dbTable.length - CS.count) {

    if (debug & 0x10) log('append')
    newScrollLeft = CS.bias.catch

  } else {

    return // thumb not near edges, nothing to do

  }

  if (debug & 0x10) {
    const newClient = {
      left: sx2cx(newScrollLeft),
      right: sx2cx(newScrollLeft + client.width),
      width: container.clientWidth,
    }
    log('newClient', newClient)
  }

  // Initialize, clamp, and validate new fetch parameters.

  let begin = sx2dx(scroll.left - newScrollLeft)
  let count = CS.count
  begin = Math.round(Math.max(0, Math.min(begin, dbTable.length - count)))
  let prepend = (begin < CS.begin) ? true : false

  let end = begin + count - 1
  if (CS.begin <= begin && begin < CS.begin + CS.count) {
    count = begin - CS.begin
    begin = CS.begin + CS.count // append a few elements
  } else if (CS.begin <= end && end < CS.begin + CS.count) {
    count = CS.begin - begin // prepend a few elements
  }
  if (count === 0)
    return // Small changes, begin === CS.begin, ignore.
  if (!(0 <= begin && 0 < count && begin + count <= dbTable.length)) {
    console.error(`Tell me this is not happening: begin=${begin}, count=${count}`)
    return
  }

  // All that for a little fetch...

  getElements(dbTable.table, begin, count, prepend)
    .then(finalFocus => CS.focus = finalFocus)
    .catch(err => console.error(err))
}

/********************************************************************
 *  Method draws and returns one canvas representing an image,
 *  its label, and its database index.
 *
 * @param {ArrayBuffer} buffer the image, raw bytes
 * @param {number} imageWidth
 * @param {number} imageHeight
 * @param {number} label the label
 * @param {number} index database index, zero-based
 */
function makeCanvas(buffer, imageWidth, imageHeight, label, index) {

  const canvas = document.createElement('canvas')

  // Note: scrollbar height is handled via padding-bottom on
  // container holding these elements.  This padding is for
  // the canvas itself.

  const padding = { top: 10, right: 10, bottom: 2, left: 10 }
  const hGlue = 10  // Padding between image and label.
  const vGlue = 2   // Padding between image/label and index.
  const labelWidth = imageWidth   // For box containing label.
  const indexHeight = imageHeight  // Element indices shown at bottom.

  canvas.width = padding.left + imageWidth
    + hGlue + labelWidth + padding.right
  canvas.height = padding.top + imageHeight
    + vGlue + indexHeight + padding.bottom

  function makeRect(xLo, yLo, xHi, yHi) {
    return {
      xLo: xLo, xMid: (xLo + xHi) / 2, xHi: xHi, xSize: xHi - xLo,
      yLo: yLo, yMid: (yLo + yHi) / 2, yHi: yHi, ySize: yHi - yLo,
    }
  }
  const rect = {
    label: makeRect(
      padding.left + imageWidth + hGlue, padding.top,
      canvas.width - padding.right, padding.top + imageHeight
    ),
    index: makeRect(
      padding.left, padding.top + imageHeight + vGlue,
      canvas.width - padding.right, canvas.height - padding.bottom
    ),
  }

  const context = canvas.getContext('2d');

  // Draw the image.

  const image = context.createImageData(imageWidth, imageHeight);
  for (let y = 0; y < imageHeight; ++y) {
    for (let x = 0; x < imageWidth; ++x) {
      const bufferOffset = y * imageWidth + x
      const imageOffset = bufferOffset * 4
      image.data[imageOffset + 0] = buffer[bufferOffset]
      image.data[imageOffset + 1] = buffer[bufferOffset]
      image.data[imageOffset + 2] = buffer[bufferOffset]
      image.data[imageOffset + 3] = 255
    }
  }
  context.putImageData(image, padding.left, padding.top)

  // Configure text layout.

  context.textBaseline = 'middle'
  context.textAlign = 'center'

  // Draw the label.

  if (debug & 0x02) {
    const gridLabel = new Path2D(
      `M${rect.label.xLo} ${rect.label.yLo - 0.5} h ${rect.label.xSize} ` +
      `M${rect.label.xLo} ${rect.label.yMid} h ${rect.label.xSize} ` +
      `M${rect.label.xLo} ${rect.label.yHi + 0.5} h${rect.label.xSize}`
    )
    context.stroke(gridLabel)
  }

  let fontLabelSize = imageHeight // px
  let fontLabelFamily = 'serif'
  let fontLabel = `${fontLabelSize}px ${fontLabelFamily}`
  context.font = fontLabel
  context.fillText(label, rect.label.xMid, rect.label.yMid + 2.5)

  // Draw the index.

  if (debug & 0x02) {
    const gridIndex = new Path2D(
      `M${rect.index.xLo} ${rect.index.yLo} h${rect.index.xSize} ` +
      `M${rect.index.xLo} ${rect.index.yMid} h${rect.index.xSize} ` +
      `M${rect.index.xLo} ${rect.index.yHi - 1} h${rect.index.xSize}`
    )
    context.stroke(gridIndex)
  }

  let fontIndexSize = Math.floor(imageHeight * 4 / 7) // px
  let fontIndexFamily = 'serif'
  let fontIndex = `${fontIndexSize}px ${fontIndexFamily}`
  context.font = fontIndex
  context.fillText(index, rect.index.xMid, rect.index.yMid + 1)

  return canvas
}

/********************************************************************
 *
 *  Method loads database elements specified by a given range into
 *  scroll buffer.  Buffer always contains a *contiguous* range of
 *  elements; caller specifies whether she wants to append or
 *  prepend the new elements to an existing buffer.
 *
 * @param {string} table database table, 'training' or 'testing'
 * @param {number} begin element starting index
 * @param {number} count number of elements to load
 * @param {boolean} prepend set *true* if prepending; else default is *false*
 */
function getElements(table, begin = 0, count = null, prepend = false) {
  return new Promise((resolve, reject) => {
    new Promise((_resolve, _reject) => {
      // console.debug(`getElements(${begin}, ${count}, ${prepend})`)
      _getElements(_resolve, _reject, table, begin, count, prepend)
    })
      .then(finalFocus => {
        // console.log(`GE: finalFocus is ${finalFocus}`)
        CS.refresh()
        resolve(finalFocus)
      })
  })
}

function _getElements(resolve, reject, table, begin, count, prepend) {

  // Validate and/or clamp input (may crash).

  //begin = State.validateIndex(begin)

  if (count === null)
    count = CS.countHint()
  else
    count = Math.max(1, parseInt(count))

  // Cache common dimensions.

  const headerSize = 4  // Header contains label.
  const imageSize = 28 * 28 // database.width * database.height // 28x28
  const elementSize = headerSize + imageSize
  const requestSize = elementSize * count

  // Buffer if prepending; then iterate backwards.

  const buffer = []

  // Make the request.

  let xhr = new XMLHttpRequest();
  xhr.open("POST", '/getElements');
  xhr.setRequestHeader('Content-type', 'text/plain')
  xhr.responseType = "arraybuffer";
  const params = new URLSearchParams({
    table: table,
    begin: begin,
    count: count,
  })

  /*
   *  Node seems to return all requested elements in one fell
   *  swoop for counts at least up to 100:
   *
   *  TODO: review XHR; you are ignoring status, readyState...
   */
  xhr.onload = function (event) {

    // Save final focus for old data before writing new data.
    // CS.focus will be NaN if this is first fetch.

    const finalFocus = CS.focus || 0

    // Write new elements.

    const arrayBuffer = xhr.response;
    const uint8 = new Uint8Array(arrayBuffer)
    const responseSize = uint8.length
    if (debug & 0x01) {
      console.debug(`onload: requested ${requestSize} bytes`
        + `, got ${responseSize}, begin = ${begin}`)
    }

    let i = 0, index = begin
    for (; i + elementSize <= responseSize; i += elementSize, ++index) {
      let header = uint8.slice(i, i + headerSize)
      let [label, height, width] = header.slice(0, 3)
      let data = uint8.slice(i + headerSize, i + headerSize + imageSize)
      const canvas = makeCanvas(data, width, height, label, index)
      if (prepend) {
        buffer.push(canvas)
      } else {
        CS.add(canvas, index)
      }
    }
    if (i < responseSize) {
      console.error(`xhr.onload: unexpected partial elements!`)
    }

    if (prepend) {
      index = CS.begin - 1
      for (let i = buffer.length - 1; 0 <= i; --i)
        CS.add(buffer[i], index--)
    }

    resolve(finalFocus)  // TODO: status, readyState, etc...
  }

  xhr.send(params)
}

/********************************************************************
 *  Method loads database metadata into database object
 *  at top of this file.
 */
function getDatabase() {
  return new Promise((resolve, reject) => {
    if (database != null)
      resolve(database)  // Once is sufficient.
    var xhr = new XMLHttpRequest();
    xhr.open("POST", '/getDatabase');
    xhr.setRequestHeader('Content-Type', 'text/plain')
    xhr.onload = function (event) {
      if (xhr.status !== 200) {
        reject(`Trouble getting database metadata: ${xhr.responseText}`)
      } else {
        resolve(database = JSON.parse(xhr.response))
      }
    }
    xhr.send()
  })
}

/* __END__

  Old notes.  Delete after some date.

*/

// /********************************************************************
//  *  Poor man's presentation of digit images.
//  *
//  *  TODO: Adjust aspect ratio for better simulation.
//  *
//  *  @param {number} width image width in pixels
//  *  @param {number} height image height in pixels
//  *  @param {ArrayBuffer} data image data, raw bytes
//  */
// function logImage(width, height, data) {
//   let thing = '\n' + '-'.repeat(width + 2)
//   for (let y = 0; y < height; ++y) {
//     thing += '\n'
//     for (let x = 0; x < width; ++x) {
//       if (x === 0) thing += '|'
//       const byte = data[y * 28 + x]
//       thing += byte ? 'X' : ' '
//       if (x === width - 1) thing += '|'
//     }
//   }
//   thing += '\n' + '-'.repeat(width + 2)
//   console.log(thing)
// }

// function _getDatabase(resolve, reject) {
//   var xhr = new XMLHttpRequest();
//   xhr.open("POST", '/getDatabase');
//   xhr.setRequestHeader('Content-Type', 'text/plain')
//   xhr.onload = function (event) {
//     if (xhr.status !== 200) {
//       reject(`Trouble getting database metadata: ${xhr.responseText}`)
//     } else {
//       resolve(database = JSON.parse(xhr.response))
//     }
//   }
//   xhr.send()
// }
