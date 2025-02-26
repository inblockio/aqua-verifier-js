
# PLAY GROUND

When creating a link revision, we should pull the tree too

A separate graph for link revision

[LogType.SUCCESS]: "✅",
[LogType.INFO]: "✨",
[LogType.ERROR]: "❌",
[LogType.FINAL_ERROR]: "🚫",
[LogType.WARNING]: "🚨",
[LogType.HINT]: "💡",
[LogType.DEBUGDATA]: "🐞",
[LogType.ARROW]: "➡️",
[LogType.FILE]: "📄",
[LogType.LINK]: "🔗",
[LogType.SIGNATURE]: "🔏",
[LogType.WITNESS]: "👀",
[LogType.FORM]: "📝",
[LogType.SCALAR]: "⏺️ ",
[LogType.TREE]: "🌿",
[LogType.EMPTY]: "",


Summary for verification (Should be a separate code):
[genesis__hash_last_four_chars] 1. [result] [type] [hash]


Should be a separate code/tool (Graph analyzer)
Normal

Tree 9774
└ ✅ 📄 0x63cafc327120621d7571c37902d5e301f023c9a751804d6dca1aadb66e469774
└ ✅ 🔏 0x201ecc1e4bacd577be39ebd150fe99055d6d0b043cc5913fbb7f884638726eeb
└ ❌ 🔏 0x15f38f29e540b23a2098f2e1665e40169635ab84ef82e225820f14e000721596
└ ✅ 👀 0x104405a7f8fccf61d115ccf5d25b038a70aff739b9110648fb9fb206784c9126
└ ✅ 🔏 0x201ecc1e4bacd577be39ebd150fe99055d6d0b043cc5913fbb7f884638726eeb

Link

Option 1: Nesting The linked aquatree
Tree 9774
└ ✅ 📄 0x63cafc327120621d7571c37902d5e301f023c9a751804d6dca1aadb66e469774
└ ✅ 🔏 0x201ecc1e4bacd577be39ebd150fe99055d6d0b043cc5913fbb7f884638726eeb
└ ❌ 🔏 0x15f38f29e540b23a2098f2e1665e40169635ab84ef82e225820f14e000721596
└ ✅ 🔗 0x0132ff3fced0484bab08feb8351763bc6fb75997760c4ab04d28e830f5a962dc
    Tree 07c19
    └ ✅ 📄 0x39c32f813c15349754021e891cc80756c5c4eebc8a4bcc3495421611e2307c19


Option 2: Flat structure for link aquatree (Preferred)
└ ✅ 📄 0x63cafc327120621d7571c37902d5e301f023c9a751804d6dca1aadb66e469774
└ ✅ 🔏 0x201ecc1e4bacd577be39ebd150fe99055d6d0b043cc5913fbb7f884638726eeb
└ ❌ 🔏 0x15f38f29e540b23a2098f2e1665e40169635ab84ef82e225820f14e000721596
└ ✅ 🔗 0x0132ff3fced0484bab08feb8351763bc6fb75997760c4ab04d28e830f5a962dc
    └ Tree 62dc

Tree 62dc
└ ✅ 📄 0x39c32f813c15349754021e891cc80756c5c4eebc8a4bcc3495421611e2307c19


Fork (Preferred for fork)

If more than one child, its a fork

Tree 9774
└ ✅ 📄 0x63cafc327120621d7571c37902d5e301f023c9a751804d6dca1aadb66e469774
└ 9774 F ✅ 🔏 0x201ecc1e4bacd577be39ebd150fe99055d6d0b043cc5913fbb7f884638726eeb
└ 9774 F ❌ 🔏 0x15f38f29e540b23a2098f2e1665e40169635ab84ef82e225820f14e000721596
└ 1596 ✅ 👀 0x104405a7f8fccf61d115ccf5d25b038a70aff739b9110648fb9fb206784c9126
└ ✅ 🔏 0x201ecc1e4bacd577be39ebd150fe99055d6d0b043cc5913fbb7f884638726eeb1