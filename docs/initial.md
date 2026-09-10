I want you to create a PRD for a web app. 

The app: a minimalist writing app. 

Name: Minitype

The UI is focused on a text input box. 
 - The box is 1-5 lines high, adjustable in settings.
 - And 70 characters wide.
 - Text cannot be deleted. 
   - Pressing backspace highlights the previous space
   - Continuing to press backspace will highlight a series of previous spaces.
   - Pressing enter will strike-out all highlighted spaces.
 - Otherwise, pressing enter will create a new line.
 - Text that flows up out of the box's region will 'disappear'
 - The box cannot be scrolled
 - When a page's worth of text has flowed up and 'disappeared', a page is filled
 - Above the box is an 'outbox' space
 - Below the box is an 'inbox' space
 - Clicking the inbox adds a page to the inbox
 - At the start you have a page 'loaded' but once it is filled, if the inbox is empty it will prompt you to add pages
 - Filling a page moves a page from the inbox to the outbox
 - Pages stack up in the outbox
 - In version 1 this could just be a counter for both boxes
 - Running the web app locally stores the files locally
 - But you can also run in 'temp' mode
 - Where all text entered will be erased when the app is quit
 - It will ask if you're sure if you want to quit if your work isn't saved
 - You can 'print' your work
 - Clicking the 'print' button compiles files in text format
 - The 'print' process is intentionally slow, mimicking a printer
 - When a page is 'printed' all struck-out spaces are removed
 - There's a small settings button to the left of the box that permits changing the typeface, colour schema, box-height, and page size

Create a preliminary design document for me to review