# Third-party notices

This repository started from the `create-expo-app` scaffold. The entry file, the configuration
files and the project layout still follow that scaffold, so its licence notice is reproduced here.
Copyright (c) 2015-present 650 Industries, Inc. (aka Expo), licensed under the MIT License:

```text
The MIT License (MIT)

Copyright (c) 2015-present 650 Industries, Inc. (aka Expo)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

The Sora typeface in `assets/fonts/` is Copyright 2019 The Sora Project Authors and is licensed
under the SIL Open Font License, Version 1.1; the licence text is in `assets/fonts/Sora-OFL.txt`.

The web build bundles code from the npm packages the app uses at run time (React,
react-native-web, the Expo modules and their dependencies), and minifying the bundle drops their
licence notices. `npm run build` therefore writes `web-build/third-party-notices.txt`, which names
every package in the bundle with its version and licence and reproduces its licence text. The file
is part of every web release archive and is served with the site at `/third-party-notices.txt`.

`@axe-core/playwright` and `axe-core` (MPL-2.0) are development tools used by the end-to-end tests
only; they are not redistributed with the app or in any release archive.
