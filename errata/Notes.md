# Notes

Assorted notes made during learning, development.

## 190615 - Stream consumption methods

Here are some methods we're learning for consuming streams.
An ulterior motive is a simple solution for multiplexing two
or more streams, like images + labels, into a single object emitter.

### [Pushy Pulling][3]

```javascript
// app.js
const idx = new IDX(fileName)
// idx.js
this.reader = fs.createReadStream(fileName)
// app.js
idx.reader.on('readable', function() {
  const chunkSize = 42
  while (data = readable.read(chunkSize)) {
    doSomething(data)
  }
})
```
So `readable` and `data` events are both "pushed" by underlying stream, but `readable` defers `Readable.read()`'s so that its callable must perform them, thereby creating a context for "pulling" chunklets until `Reader`'s main chunk runs out, `Reader.read()` returns null, `Reader` goes and gets next big
chunk, and the process repeats.

Happily, `chunkSize` works with `fs.ReadStream`, but you need to consume
entire chunk before another 'readable' is emitted.  I also noticed
"burping" between reads &mdash; you request 784 bytes but only 464 bytes
remain in stream buffer &mdash; I think the stream tries to handle this,
refilling its buffer partially and concatenating the necessary pieces for
you, And I did not carefully check results...

### [Asynchronous Iteration][4]

All node streams appear to include the [special magic][1],
```javascript
readable[Symbol.asyncIterator]()
```
This allows streams to be used in `for await...of` loops,
```javascript
async function main(reader) {
  for await (const data of reader) {
    doSomething(data)
  }
}
main()
// Next line continues execution in current time slot.
```
This consumes entire stream unless you break from loop, in which case stream is destroyed, additional data ignored.  So far, the *pull* method seems best for multiplexing, especially partitioning big chunks into appropriately sized chunklets.  Chunklets?

Note that while `readable.readableHighWaterMark` appears to
control the size of chunks delivered by reader, it also appears
to control actual reader buffer size so that reducing default
64KB buffer to 1 or a few hundred bytes has unpleasant side
effect of slowing program down by factors near ten!  So don't
do that; there is no "bigger smarter buffer" hiding in background.
Make your own damn chunklets.

### [Asynchronous Generators][2]

See [this](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols) and [that](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Iterators_and_Generators) for the overall pattern, history.
In particular, remember these factoids (for synchronous generators) from MDN:

```javascript
typeof aGeneratorObject.next;
// "function", because it has a
// next method, so it's an Iterator
typeof aGeneratorObject[Symbol.iterator];
// "function", because it has an @@iterator
// method, so it's an Iterable
```
As mentioned above, `Reader[Symbol.asyncIterator]` is the
property for asynchronous iterables.  These are also functions
(so are *iterable*), but `Reader.next` is undefined.  Instead, if
you call this function directly, you get back an object
different from the synchronous `{value: 2, done: false}` return
values; if you `await` this function inside another asynchronous
function, you receive a `Promise`.
```javascript
async function* bySize(reader, chunkSize) {
  // Long code elided; see streamutils.js
}
```
This is nice and seems to work with a variety of (bizarre) values
for `chunkSize` and `highWaterMark`.  Cohesive, uncoupled, it
encapsulates a simple problem "break this buffer into chunks of
a given size" and is easy to use:
```javascript
for await (const data of bySize(reader, size)) ...
```
TODO: Learn to create an npm module.

One more question before shipping.  Can we simplify `bySize()` by
using `Reader.read()` rather than `for await...of`?
```javascript
async function* bySize(reader, chunkSize) {
  reader.on('readable', function onReadable() {
    let data = null
    while (data = reader.read(chunkSize)) {
      yield data  // Does not compile.
    }
  })
}
```
Looks promising, but `yield` does not compile because `onReadable()`
is not a generator and nested generators are beyond my scope.

## 190614
Also see
- https://www.w3schools.com/tags/canvas_createimagedata.asp
- http://2ality.com/2018/04/async-iter-nodejs.html
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of

## 190613
Also see
-  https://stackoverflow.com/a/19606031 (get endianness);
-  https://stackoverflow.com/a/22826906 (create images);

## 190612
Also see
- https://www.youtube.com/watch?v=aircAruvnKk (3blue1brown)
- http://neuralnetworksanddeeplearning.com/chap1.html (Michael Nielsen)
- http://yann.lecun.com/exdb/mnist/ (MNIST image data)

[comment]: # (See https://stackoverflow.com/a/20885980)

[//]: # (References)

[1]: https://nodejs.org/dist/latest-v12.x/docs/api/stream.html#stream_readable_symbol_asynciterator
[2]: http://2ality.com/2018/04/async-iter-nodejs.html#processing-async-iterables-via-async-generators
[3]: https://nodejs.org/dist/latest-v12.x/docs/api/stream.html#stream_event_readable
[4]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of
