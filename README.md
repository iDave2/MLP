# Multilayer Perceptrons (MLP)

Inspired by delightful tutorials from [3blue1brown][1] and
[Michael Neilsen][2], this project targets a `nodejs` port
of the same.  So far, it is just a scrollbar.  A really cool
scrollbar.  The rest should be easier.  :)

To run, download and unzip [MNIST][3] databases into an MNIST
subdirectory of this one or create an MNIST link here that
locates your unzipped downloads.

Then you can run tests from command line,
```bash
$ npm test
$ npm test -- -begin 5000 --count=100 --data=testing
# etc...
```
or browse `http://localhost:3000` over `nodejs`,
```bash
$ ./mlp.js
```
I've been testing on Safari and Chrome, hopefully it works
in more environments.

[//]: # (References)

[1]: https://www.youtube.com/watch?v=aircAruvnKk
[2]: http://neuralnetworksanddeeplearning.com/chap1.html
[3]: http://yann.lecun.com/exdb/mnist/
