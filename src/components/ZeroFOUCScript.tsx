'use client';

import React, { useState } from 'react';
import { useServerInsertedHTML } from 'next/navigation';

if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  const orig = console.error;
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('Encountered a script tag')) return;
    orig.apply(console, args);
  };
}

const ZERO_FOUC_CODE = `
(function() {
  var candidates = [];
  function check(raw) {
    if (!raw) return;
    try {
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        candidates.push({ s: parsed, t: typeof parsed._updatedAt === 'number' ? parsed._updatedAt : 0 });
      }
    } catch (e) {}
  }
  try { check(localStorage.getItem('minitype_global_settings')); } catch (e) {}
  try { check(sessionStorage.getItem('minitype_global_settings')); } catch (e) {}
  try {
    if (document.cookie) {
      var cks = document.cookie.split(';');
      for (var cIdx = 0; cIdx < cks.length; cIdx++) {
        var cTrimmed = cks[cIdx].trim();
        if (cTrimmed.indexOf('minitype_global_settings=') === 0) {
          check(decodeURIComponent(cTrimmed.slice(25)));
        }
      }
    }
  } catch (e) {}
  try {
    if (window.name && window.name.indexOf('minitype_settings:') === 0) {
      check(window.name.slice(18));
    }
  } catch (e) {}
  if (candidates.length > 0) {
    candidates.sort(function(a, b) { return b.t - a.t; });
    var finalS = {};
    for (var i = candidates.length - 1; i >= 0; i--) {
      var item = candidates[i].s;
      for (var k in item) {
        if (item[k] !== undefined) {
          finalS[k] = item[k];
        }
      }
    }
    if (finalS.colorScheme) {
      document.documentElement.setAttribute('data-theme', finalS.colorScheme);
    }
    if (finalS.textSize) {
      document.documentElement.setAttribute('data-text-size', finalS.textSize);
    }
    if (finalS.activeApertureHeight) {
      document.documentElement.setAttribute('data-aperture-height', String(finalS.activeApertureHeight));
    }
    if (finalS.pageMode) {
      document.documentElement.setAttribute('data-page-mode', finalS.pageMode);
    }
    if (finalS.pageSize) {
      document.documentElement.setAttribute('data-page-size', String(finalS.pageSize));
    }
    if (finalS.showStats !== undefined) {
      document.documentElement.setAttribute('data-show-stats', String(finalS.showStats));
    }
    if (finalS.doubleSpaceLinebreaks !== undefined) {
      document.documentElement.setAttribute('data-double-space', String(finalS.doubleSpaceLinebreaks));
    }
    if (finalS.allowStrikeout !== undefined) {
      document.documentElement.setAttribute('data-allow-strikeout', String(finalS.allowStrikeout));
    }
    if (finalS.showClock !== undefined) {
      document.documentElement.setAttribute('data-show-clock', String(finalS.showClock));
    }
    if (finalS.clockFormat) {
      document.documentElement.setAttribute('data-clock-format', String(finalS.clockFormat));
    }
    if (finalS.phosphorColor) {
      document.documentElement.setAttribute('data-phosphor', String(finalS.phosphorColor));
    }
    if (candidates[0] && candidates[0].t) {
      document.documentElement.setAttribute('data-updated-at', String(candidates[0].t));
    }
  }
})();
`;

export function ZeroFOUCScript() {
  const [isRendered, setIsRendered] = useState(false);

  useServerInsertedHTML(() => {
    if (isRendered) return null;
    setIsRendered(true);
    return (
      <script
        id="minitype-zero-fouc"
        dangerouslySetInnerHTML={{ __html: ZERO_FOUC_CODE }}
      />
    );
  });

  return null;
}
