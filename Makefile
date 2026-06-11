# bttnns.com — static site, no build step.
# Serve locally over HTTP so root-absolute paths (/a/...) resolve
# the same way they do on GitHub Pages.

PORT ?= 8731
URL  := http://127.0.0.1:$(PORT)

.PHONY: serve open help

## serve: run a local web server on PORT (default 8000)
serve:
	@echo "Serving $(URL)  (Ctrl-C to stop)"
	@python3 -m http.server $(PORT)

## open: start the server and open the site in your browser
open:
	@python3 -m http.server $(PORT) & \
	  sleep 1; open $(URL); wait

## help: list targets
help:
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/## //'
