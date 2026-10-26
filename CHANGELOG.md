# Changelog

All notable changes to this project are listed here, newest first. The sections follow
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). release-please writes each entry from
the Conventional Commit titles of the merged pull requests; do not edit entries by hand.

<!-- release-please inserts each new release above the first line that starts with "## ["
     (or "## " and a digit). Keep the "Origin" entry below as the last entry of this file. -->

## 0.1.0 (2026-10-26)


### Added

* **a11y:** announce the round state and label every control ([d75c2a3](https://github.com/luminare-dev/FiveGuesses/commit/d75c2a33bf40be604a64593a6e46046391204588))
* **a11y:** turn the guess box into an accessible combobox with keyboard control ([6255d7f](https://github.com/luminare-dev/FiveGuesses/commit/6255d7ff227331ed5b3306753884f770b19d9bef))
* **game:** keep free play away from today's song and from repeats ([66ec647](https://github.com/luminare-dev/FiveGuesses/commit/66ec6474f1d7292ae4dc30248ac284715089e7fd))
* **game:** keep the round, stats and storage logic in pure modules ([5418437](https://github.com/luminare-dev/FiveGuesses/commit/541843732430470e1a23d8238f1f7738678a65a9))
* **game:** roll over to the next puzzle at local midnight and show a countdown ([310d4db](https://github.com/luminare-dev/FiveGuesses/commit/310d4db825f6b605692a702a2946995ce9399bc6))
* **pwa:** add a manifest, icons and a service worker for the app shell ([d102e05](https://github.com/luminare-dev/FiveGuesses/commit/d102e0547ee49e7dbf95632423d5b681e59a1e5b))
* scaffold the daily song-guessing game ([5ce3704](https://github.com/luminare-dev/FiveGuesses/commit/5ce370453609569e5e13397defa7016d33f23a10))
* **share:** format the result as a snippet ladder ([e32062c](https://github.com/luminare-dev/FiveGuesses/commit/e32062cd38f75d8c1ff1b2ce2b35091fc18bc052))
* **share:** send the result through the system share sheet ([87baa5e](https://github.com/luminare-dev/FiveGuesses/commit/87baa5e83e9eb70ad00410623463ab702f7dc284))
* **stats:** show the guess distribution in a stats sheet ([d78522c](https://github.com/luminare-dev/FiveGuesses/commit/d78522c1c9a3da71789c44f15cd10354fef0bf9d))
* **theme:** add a light theme that follows the system setting ([24de02e](https://github.com/luminare-dev/FiveGuesses/commit/24de02eed5a7f8ae9e1198e09c715e659a230e90))
* **web:** add the legal page ([2f9c708](https://github.com/luminare-dev/FiveGuesses/commit/2f9c70866c5c5c8a4aea0a10ad95453ee41d3250))
* **web:** add the static shell skeleton, the font and the apache settings ([a353525](https://github.com/luminare-dev/FiveGuesses/commit/a353525888636ae66a346d4e9076b2d8a1c9becf))
* **web:** finish the static shell with the colour scheme and the icon links ([f7bca1d](https://github.com/luminare-dev/FiveGuesses/commit/f7bca1dcabe9650aa857d9dfe6f081b513a0cdfe))


### Fixed

* **audio:** load the preview on demand and stop it from the playback position ([b0b01ea](https://github.com/luminare-dev/FiveGuesses/commit/b0b01ea859951be602e91fc7bf765071f912b117))
* **data:** drop three entries whose previews were not the original recordings ([d7d7e62](https://github.com/luminare-dev/FiveGuesses/commit/d7d7e62b95240d089f8bbd02c236b0276f6724e8))
* **game:** hold the countdown at zero until the rollover ([6acd3c0](https://github.com/luminare-dev/FiveGuesses/commit/6acd3c0863128a16ecf53f8bf01147dc4e17166a))
* **game:** keep a finished round safe from an older tab ([d831542](https://github.com/luminare-dev/FiveGuesses/commit/d831542b7ab946c8992acff7c731539ee429f1d6))
* **game:** match song names typed without punctuation ([0758e34](https://github.com/luminare-dev/FiveGuesses/commit/0758e34942fd662b6aab2c199cbfa3857a5290d5))


### Changed

* **ui:** run the countdown tick in its own component ([56b2363](https://github.com/luminare-dev/FiveGuesses/commit/56b2363997c581b315f170f0eb557ffb514b6ed0))

## [Origin] - created from oss-template

This repository was created from
[luminare-dev/oss-template](https://github.com/luminare-dev/oss-template). Releases are listed
above this entry.
