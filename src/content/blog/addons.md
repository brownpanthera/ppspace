---
title: "Building Node.js Addons from First Principle"
pubDate: 2025-08-03
description: "building Node.js addons using C++ from scratch, covering compilation, linking, and ABI compatibility issues."
---

<style>
@media (max-width: 768px) {
  pre {
    overflow-x: auto;
    word-wrap: break-word;
    white-space: pre-wrap;
  }
  
  code {
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  
  img {
    max-width: 100% !important;
    height: auto !important;
  }
  
  p {
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
}
</style>

# node.js addons from first principle
<br>

```cpp
#include <node.h>
#include <iostream>

void Initialize(v8::Local <v8::Object> exports){
  std::cout<< "hello, world" <<std::endl;
}

NODE_MODULE(NODE_GYP_MODULE_NAME, Initialize)
```
<br>
If I try to compile this it will throw an error `node.h: no such file or directory exists`. Which is correct, so my goal was to let compiler know where node.h is and to link this to my program, somehow so that i can get my addon and run it from js environment.
<br>
<br>


So node.h is ofcourse not a standard C++ header, it is part of node.js c++ api which basically means the compiler does not know where to find node.js headers. Also you can see my code is using V8::Local and V8::Object which require v8 headers to be included, and the actual V8 and Node.js function implementations will need to be linked via node.lib.

btw headers contain only declaration not implementation so when i include node.h header i can get things like, function signature, type definations (v8::Local, v8::Object), class declarations and so on. the problem is headers don't contain the actual executable code. 

basically things are already compiled and running inside the node.js process, and my addon needs node.lib to know how to call that existing code at runtime.

w/o node.lib linker can't find the actual implementation of the V8/node.js functions.
<br>
<br>

The first step is locating Node.js headers. On Windows Node.js installations don't include headers by default, They only ship with runtime binaries (node.exe, npm). but on linux it ships with node headers.
<br>
<br>

If you already have Node.js installed, you have `node.exe`. You just need to download:
<br>
<br>


1. **Headers**: Download `node-v21.7.3-headers.tar.gz` from the [official release page](https://nodejs.org/download/release/v21.7.3/)
2. **node.lib**: Download the node.lib (https://nodejs.org/download/release/v21.7.3/win-x64/)
<br>
<br>

In my case I found them already cached from a previous project, i have used node-gyp before so i have already headers files and lib file. also linux does not need .lib which i don't yet. basically what i understand is here on linux node functions are already loaded in the process memory but still i don't how. so i won't cover this. 
<br>
<br>

anyways so you need 3 things: node.exe (runtime), node.lib (import library for linking) and the headers which have our node.h. node.lib file will help us to link c++ code to js. Without this our addon won't know how to call node internal functions at link time so the build will fail. Basically its job is to provide things when we build native cpp addons or we embed node.js into another application.
<br>
<br>

```bash
g++ -shared hello.cpp -o hello.node
```
<br>
<br>

Here on Windows shared objects are actually .dll (dynamic link libraries) and on linux they are .so files. however node.js uses its own convention .node extension on both platforms, even though they're technically DLLs on windows and shared objects on linux. the .node extension is required. Node.js specifically looks for this extension when loading native addons and won't recognize .dll or .so files as addons.
<br>
<br>

```bash
g++ -shared hello.cpp -o hello.node -I"C:\Users\alifa\AppData\Local\node-gyp\Cache\21.7.3\include\node"
```
<br>
<br>

So after including the path of my headers, it complains that it needs C++17. My compiler defaults to C++14, so I had to add the C++17 flag. Node.js uses C++17 features that aren't available in C++14.
<br>
<br>

```bash
g++ -shared -std=c++17 hello.cpp -o hello.node -I"C:\Users\alifa\AppData\Local\node-gyp\Cache\21.7.3\include\node"
```
<br>
<br>

Now the linker complains that it can't find the V8 and Node.js API functions. The headers declare these functions, but the linker needs to know how to call them at runtime. That's where node.lib comes in. it's an import library that tells our addon how to access the V8 and Node.js functions that are already running in the Node.js process. also i am assuming on linux this process won't be needed.
<br>
<br>


```bash
g++ -shared -std=c++17 hello.cpp -o hello.node -I"C:\Users\alifa\AppData\Local\node-gyp\Cache\21.7.3\include\node" -L"C:\Users\alifa\AppData\Local\node-gyp\Cache\21.7.3\x64" -lnode
```
<br>
<br>


So far i am trying to build a DLL (or shared obj) which is hello.node that will let us run our addon from js env. i added the C++17 flag, included the header path with -I, and linked the Node.js library with -l flag
<br>
<br>

Now I got an incompatibility error. as i am using GNU toolchain which is based on MinGW or ming32 but Node.js is using MSVC. I couldn't understand the error, so I asked Claude. and i confirmed by doing simple os.type() and got 'Windows_NT' which confirms Node.js was compiled with MSVC and this right here create ABI mismatch or incompatibility. I have heard before ABI what it is but first time encountering incompatibility. Basically you have seen repos or codebase which have multiple languages used, so ABI defines the low-level interface between compiled code how functions are called, how data is structured, and how symbols are named. When different compilers use different ABIs (like MSVC vs MinGW), their compiled code can't interact properly, even if they're both compiling the same C++ source code.
<br>
<br>


So basically Node.js built with MSVC which is Windows standard, and my addon is being built on mingw32 gcc port, and when i try to do linking it failed because convention differ. different compilers have different ABIs, windows MSVC is the native toolchain and cross compiling linking requires careful ABI matching. MSVC expects .lib and mingw expects .a.exe.
<br>
<br>


altho it didn't explicitely mentioned anywhere it that there is incompatibility issue but claude tells me it is, so yeah...
<br>
<br>

```
mingw compiler (gcc toolchain) → node.lib (built with msvc toolchain) → node.exe (built with msvc toolchain)
```
<br>
<br>

So why can't different ABIs communicate with each other?
<br>
<br>

**Function calling conventions** - Different compilers pass parameters to functions differently. for eg, one might pass arguments on the stack, while another uses CPU registers.
<br>
<br>

**Name mangling** - C++ compilers encode function names differently to handle overloading and namespaces. MSVC might name a function as `?NewFromUtf8@String@v8@@...` while MinGW names the same function as `_ZN2v86String11NewFromUtf8E...`.
<br>
<br>

**Stack alignment** - Compilers organize memory differently. One might align data on 4-byte boundaries while another uses 8-byte alignment causing crashes when they try to share data.
<br>
<br>
core dumped [video](https://www.youtube.com/watch?v=XJC5WB2Bwrc&t)
<br>
<br>

So our linker can't match two different things, we have to come on same page. So I'm going to compile now with MSVC as MSVC is used by node, basically node compiled with MSVC so it would be good if i go with MSVC I think. Or i can just download the mingw compiled node version (which I didn't find) then only i can have compatible ABI and it will not complain.
<br>
<br>


So now i moved to msvc to compile my code.
<br>
<br>


```cmd
cl /std:c++17 /I"C:\Users\alifa\AppData\Local\node-gyp\Cache\21.7.3\include\node" hello.cpp "C:\Users\alifa\AppData\Local\node-gyp\Cache\21.7.3\x64\node.lib" /LD /Fe:hello.node
```
<br>
<br>

btw you can download Visual Studio to get the complete Windows development toolchain: cl.exe (compiler), link.exe (linker), Windows SDK headers, and pre-configured developer command prompts with environment variables.
<br>
<br>


So i pull up the developer command prompt then from there i try to compile my code. that shell is using msvc toolchain so i got no problem. but it complain about architecture of node, cause in my case i'm using the x64 version of Node.js and that shell was on x86. basically my Node.js binary targets x64 architecture and if you try to link on some x86 32 bit arch then it will throw error `warning LNK4272: library machine type 'x64' conflicts with target machine type 'x86'`. you can know youar arch by doing process.arch on repl. windows ships x64 version too. so i used that shell. Windows love backward compatibility btw. 
<br>
<br>

```
        hello.cpp + node.h + node.lib -> MSVC compiler => hello.obj -> MSVC linker => hello.node
```
<br>
<br>


<img src="/process.png" alt="Node.js addon compilation process diagram" style="max-width: 100%; height: auto;" />
<br>
<br>


So after successful compilation it generates a few files:
<br>
<br>


**hello.node**
This is what we specified while compiling - basically our DLL. This is our addon, the DLL that Node.js will load. It contains our compiled C++ code + Node.js API bindings. This is what we require from JavaScript.
<br>
<br>


**hello.obj**
Intermediate compiled code from hello.cpp. Contains machine code that's not yet linked and is used by the linker to create the final DLL.
<br>
<br>

**hello.lib**
Import library for our DLL, which contains stubs that tell other programs how to call functions in our DLL. This gets created when we use the /LD flag.
<br>
<br>

**hello.exp**
Export file that lists what functions our DLL exports. Used internally by the linker and contains metadata about our DLL's interface.
<br>
<br>
<hr> <hr>