# What does basicRun.js do?

1. Navigates to the canonical test spreadsheet's attached script

2. Removes the current legaleseMain library and adds your test library for testing a change/patch etc.

3. Navigates to the canonical test spreadsheet and generates PDFs.

4. Navigates to Google Drive to check for XML output.

## How do I use this?

Install [casperjs](http://casperjs.org/) and [slimerjs](https://slimerjs.org/).

Then: `casperjs --engine=slimerjs <email> <password> <your library's identifier>`

### Where do I get my library's identifier?

When you're at your library's script editor page: `Files/Project Properties`.

## What do I need to do before using this script/common gotchas

At your library: `File/Manage Versions/Save New Version`. Do this after every change you want to test.

Ensure that the email account you are using for this script is the same as the one you used when creating the test library, otherwise Google spits permissions errors.

Ensure you also have write access to the test spreadsheet/script.
