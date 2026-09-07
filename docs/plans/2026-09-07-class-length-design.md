# Course length signature

Purpose: tell the user whether a meeting contains one, two or three teaching periods while keeping the clock time legible.

Use a small fixed-width signature containing the total number of periods and the same number of static short bars. Replace the existing verbose period label in today's list, the mobile week list, the desktop matrix and the live-status card. Keep start/end clock times visible, untruncated and separate from the signature. Preserve exact numbered periods in course details, the signature's accessible label and its desktop tooltip.

The bars mean total teaching periods, not completed periods. They never animate or change as time passes. Derive the number from the validated SLOT_PERIODS mapping rather than elapsed clock minutes, which include breaks. Unknown periods must not receive a guessed count.

Keep existing card dimensions, course-status colors, attendance rules and all local/cloud course data. Narrow layouts may wrap the entire time and signature into separate lines, but never split a clock time or shrink the signature into unreadable text. The component uses local inline SVG and CSS with no external dependencies.

Verification: check every supported slot, especially 3–4 versus 3–5 and 9–10 versus 9–11, verify rendered matrix signatures, and compare local/published RAW_DATA with the previous release and cloud data. Do not claim phone-device visual testing without actually performing it.
