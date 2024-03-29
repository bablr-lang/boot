## @bablr/boot

What a great name. BABLR is defined in terms of BABLR, so this repo helps BABLR boot up without getting stuck in dependency cycles!

### Bootstrapping

This package's job is to break dependency cycles that arise when evolving the system by using code generation. The nature of the cycles is this:

- The VM needs parsed instructions to process code
- The parser for the instruction language needs a VM with the instruction language already defined
- The instruction language now needs itself to parse itself

Using code-generation to bypass this conundrum is a form of "bootstrapping", which is actually not a one-time event but a continuous process, since the dependency cycle cannot fully be eliminated. In general we use this package to define code generation that uses the last generation of parsers to codegen instructions that are valid definitions for the "core languages" in the next version of the parser.

This allows us to do the following:

- Import the "core grammars" compiled for the next vm, and the next VM into the helpers
- Import template tags defined by the helpers into non-core grammars
  - Define non-core grammar in terms of template tags like `` i`eat(' ')` ``
    - These result of evaluating these template tags is a parse tree not a string
- Execute the grammar, using the helper VM to parse template tag instructions on the fly
  - Cache parsed instructions when they are static using `WeakMap` using `quasis` (first) argument to the template string iterpolator as the cache key, a trick that is possible because `quasis` is an array (a valid `WeakMap` key) whose identity does not change between subsequent invocations. This is how a pattern that looks slow can be fast! Using template string interpolation, e.g. `` i`eat(${something})` `` will prevent caching.
