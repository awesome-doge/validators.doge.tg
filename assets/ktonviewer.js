  (function() {
    const formatWithCommas = (numStr) => {
      if (!numStr) return numStr;
      const n = Number(numStr.replace(/,/g, ''));
      if (!isFinite(n)) return numStr;
      return n.toLocaleString('en-US');
    };

    const formatText = (text) => {
      // Replace standalone numbers with 4+ digits (not part of alphanumeric word)
      return text.replace(/(?<![A-Za-z0-9#])(\d{4,})(?![A-Za-z0-9])/g, (m) => formatWithCommas(m))
                 // Also format after '#'
                 .replace(/#(\d{4,})/g, (_, d) => '#' + formatWithCommas(d));
    };

    const walkAndFormat = (root) => {
      if (!root) return;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      const nodes = [];
      let node;
      while ((node = walker.nextNode())) nodes.push(node);
      nodes.forEach((t) => {
        const original = t.nodeValue;
        const formatted = formatText(original);
        if (formatted !== original) t.nodeValue = formatted;
      });
    };

    const target = document.getElementById('root');
    const apply = () => walkAndFormat(target || document.body);
    apply();
    const observer = new MutationObserver(() => apply());
    if (target) observer.observe(target, { childList: true, subtree: true, characterData: true });
  })();
