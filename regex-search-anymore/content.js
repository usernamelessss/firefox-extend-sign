(() => {
    if (window.hasRun) {
        return;
    }
    window.hasRun = true;

    var matches = null;
    var selectionIndex = null;

    var lastRegex = null;
    var lastFlags = null;

    function sanitizeInputRegex(str) {
        const emptyRegex = /^[\^\$]*$/

        if (str === "" 
            || str === "\\B"
            || emptyRegex.test(str)) {
            return null;
        }

        return str;
    }

    function sanitizeInputFlags(str) {
        const validCharacters = "imsuv";
        let outputString = "";

        for (const character of validCharacters) {
            if (!str.includes(character)) continue;
            outputString += character;
        }

        return outputString;
    }

    function selectTextInElement(element) {
        const selection = window.getSelection();
        const range = document.createRange();

        range.selectNodeContents(element); 

        selection.removeAllRanges();
        selection.addRange(range);
    }

    function clearMatches() {
        if (matches === null) return;

        for (const span of matches) {
            if (span === null || span === undefined) {
                console.warn("Lost a reference to span, continuing");
                continue;
            }

            if (span.parentNode === null || span.parentNode === undefined) {
                console.warn("Span does not have a parent node, continuing");
                continue;
            }

            const spanText = span.textContent;
            const newText = document.createTextNode(spanText);

            span.replaceWith(newText);
            newText.parentNode.normalize();
        }

        matches = null;
        selectionIndex = null;
    }

    function quickSearch(regexStr, flags) {
        flags = sanitizeInputFlags(flags);
        lastFlags = flags;

        regexStr = sanitizeInputRegex(regexStr);

        if (regexStr === null) {
            lastRegex = "";
            return;
        }

        lastRegex = regexStr;

        const regex = new RegExp(regexStr, "dg" + flags);
        console.debug("Highlighting matches for: ", regex);

        const nodeIterator = document.createNodeIterator(
            document.body, 
            NodeFilter.SHOW_TEXT, 
            {
                acceptNode(node) {
                    return node.parentElement !== null
                           && node.parentElement.checkVisibility()
                           && regex.test(node.textContent)
                           ? NodeFilter.FILTER_ACCEPT 
                           : NodeFilter.FILTER_REJECT;
                }
            }
        );

        let matchedNodes = [];
        let node;
        while ((node = nodeIterator.nextNode())) {
            console.debug("Found match in node: ", node);
            matchedNodes.push(node);
        }

        matches = [];

        for (const node of matchedNodes) {
            let regexExec;
            let leftoverNode = node;
            while (
                (regexExec = regex.exec(leftoverNode.textContent)) !== null
            ) {
                console.debug("Operating on node: ", leftoverNode);
                console.debug("Match: ", regexExec);

                const startIndex = regexExec.indices[0][0];
                const endIndex = regexExec.indices[0][1];

                const matchLength = endIndex - startIndex;

                leftoverNode = leftoverNode.splitText(startIndex);

                const newSpan = document.createElement("span");
                newSpan.textContent = leftoverNode.nodeValue
                                      .substring(0, matchLength);
                newSpan.title = "/" + regexStr + "/";
                newSpan.style.backgroundColor = "yellow";
                newSpan.style.outline = "1px solid yellow";

                leftoverNode.parentNode.insertBefore(newSpan, leftoverNode);
                leftoverNode.nodeValue = leftoverNode.nodeValue
                                         .substring(matchLength);

                console.debug("Created new span and text node: ", leftoverNode);

                matches.push(newSpan);
                regex.lastIndex = 0;
            }
        }

        console.debug("Generated match table:", matches);

        if (matches.length !== 0) {
            selectionIndex = 0;
            updateSelection();
        }
    }

    function updateSelection() {
        const selectedElement = matches[selectionIndex];

        console.debug("Selection #", selectionIndex, ":", selectedElement)

        selectTextInElement(selectedElement);
        selectedElement.scrollIntoView({ block: 'center' });
    }

    function selectMatch(isNext) {
        if (selectionIndex === null
            || matches === null 
            || matches.length === 0) {
            return;
        }

        const indexShift = isNext ? 1 : matches.length - 1;
        selectionIndex = (selectionIndex + indexShift) % matches.length
        updateSelection();
    }

    browser.runtime.onMessage.addListener(
        async (message, sender, sendResponse) => {
            switch (message.action) {
                case "QUICK_SEARCH": 
                    clearMatches();
                    quickSearch(message.regex, message.flags);
                    return;
                case "CLEAR_MATCHES": 
                    clearMatches();
                    return;
                case "SHOW_NEXT": 
                    selectMatch(true);
                    return;
                case "SHOW_PREV": 
                    selectMatch(false);
                    return;

                case "CHECK_CONNECTION":
                    return true;

                case "GET_LAST_INPUT":
                    return { 
                        lastRegex: lastRegex,
                        lastFlags: lastFlags 
                    };
                case "GET_MATCHES":
                    return { matches: matches ? matches.length : null };
                case "GET_SELECTION":
                    return { selection: selectionIndex };

                default:
                    console.error("Unknown message from popup.js "
                                  + message.action + "!");
                    return;
            }
        }
    );
})();
