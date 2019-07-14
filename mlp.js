#!/usr/bin/env node
/********************************************************************
 * A nodejs server for the MNIST demos / tutorials.
 */

const fs = require('fs')
const http = require('http')
const xhr = require('./lib/xhr')

const hostname = '127.0.0.1', port = 3000
const charset = 'UTF-8', webRoot = 'web/'
const index = `${webRoot}index.html`

const server = http.createServer((request, response) => {

  const { headers, method, url } = request
  console.log(`-> ${method} ${url}`)

  // Setup error handlers.

  request.on('error', (err) => {
    console.error(err);
    response.statusCode = 400; // Blame the user? Why not!
    response.end();
  })
  response.on('error', (err) => {
    console.error(err);
  });

  // Process request.

  if (method === 'POST') {

    let body = [];
    request.on('data', function (chunk) {
      body.push(chunk)
    })
    request.on('end', () => {

      body = Buffer.concat(body).toString();

      if (url === '/getDatabase') {

        const usp = new URLSearchParams(body)
        xhr.getDatabase(request, response)

      } else if (url === '/getElements') {

        // Use conservative defaults if input is skunky.
        const usp = new URLSearchParams(body)
        const table = usp.has('table') ? usp.get('table') : 'training'
        const begin = usp.has('begin') ? usp.get('begin') : 0
        const count = usp.has('count') ? usp.get('count') : 1
        xhr.getElements(request, response, table, begin, count)

      } else {

        console.error(`unsupported request: ${method} ${url}`)
        response.statusCode = 404 // not found
        response.setHeader('Content-Type', `text/plain; ${charset}`)
        response.end('not found');

      }
    })

  } else if (method === 'GET') {

    // Serve up files.

    if (url !== '/' && !url.startsWith(`/${webRoot}`)) {

      response.statusCode = 404 // Not our web.
      response.setHeader('Content-Type', `text/plain; ${charset}`);
      response.end();

    } else {

      const match = /.*\.(\w+)$/.exec(url)
      const extension = match ? match[1] : ''

      let contentType = null
      switch (extension) {
        case 'css':
          contentType = `text/css; ${charset}`
          break
        case 'html':
          contentType = `text/html; ${charset}`
          break
        case 'js':
          contentType = `text/javascript; ${charset}`
          break
        case 'png':
          contentType = `image/png; ${charset}`
          break
        default:
          contentType = 'text/' + (url === '/' ? 'html' : 'plain') + `; ${charset}`
          break
      }

      const fileName = url === '/' ? index : url.substring(1)

      fs.readFile(fileName, (err, data) => {
        if (err) {
          console.error(err);
          response.statusCode = 404; // Could also be our fault, out-of-scope.
          // Chrome inserts nice error message; Safari remains BLANK...
          // TODO: copy set of error pages from somewhere.
          response.setHeader('Content-Type', `text/plain; ${charset}`)
          response.end();
        } else {
          response.statusCode = 200;
          response.setHeader('Content-Type', contentType);
          response.end(data);
        }
      });
    }

  } else {

    console.error(`unsupported request: ${method} ${url}`)
    response.statusCode = 404 // not found
    response.setHeader('Content-Type', `text/plain; ${charset}`)
    response.end('not found');

  }
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});