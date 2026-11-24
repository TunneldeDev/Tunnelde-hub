// Generated public preference schemas; run sdk:sync to update.
export default {
  "version": 1,
  "stability": "experimental",
  "groups": {
    "general": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "title": "general",
      "type": "object",
      "properties": {
        "language": {
          "type": "string",
          "enum": [
            "system",
            "zh-CN",
            "en-US"
          ]
        },
        "closeToTray": {
          "type": "boolean"
        },
        "releaseWebviewInTray": {
          "type": "boolean"
        },
        "lightweightMode": {
          "type": "boolean"
        },
        "showDockIconInBackground": {
          "type": "boolean"
        }
      },
      "required": [
        "language",
        "closeToTray",
        "releaseWebviewInTray",
        "lightweightMode",
        "showDockIconInBackground"
      ],
      "additionalProperties": false
    },
    "appearance": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "title": "appearance",
      "type": "object",
      "properties": {
        "theme": {
          "type": "string",
          "enum": [
            "system",
            "dark",
            "light"
          ]
        },
        "accent": {
          "type": "string",
          "maxLength": 129
        },
        "colors": {
          "type": "object",
          "properties": {
            "background": {
              "type": "string",
              "maxLength": 7
            },
            "activityBar": {
              "type": "string",
              "maxLength": 7
            },
            "sidebar": {
              "type": "string",
              "maxLength": 7
            },
            "titleBar": {
              "type": "string",
              "maxLength": 7
            },
            "tabBar": {
              "type": "string",
              "maxLength": 7
            },
            "editor": {
              "type": "string",
              "maxLength": 7
            },
            "panel": {
              "type": "string",
              "maxLength": 7
            },
            "statusBar": {
              "type": "string",
              "maxLength": 7
            },
            "terminalBackground": {
              "type": "string",
              "maxLength": 7
            },
            "terminalForeground": {
              "type": "string",
              "maxLength": 7
            },
            "terminalCursor": {
              "type": "string",
              "maxLength": 7
            }
          },
          "additionalProperties": false
        },
        "density": {
          "type": "string",
          "enum": [
            "comfortable",
            "compact"
          ]
        },
        "fontSize": {
          "type": "integer",
          "minimum": 11,
          "maximum": 20
        },
        "monoFontSize": {
          "type": "integer",
          "minimum": 10,
          "maximum": 32
        },
        "monoFont": {
          "type": "string",
          "enum": [
            "fira-code",
            "jetbrains-mono",
            "plex-mono",
            "system"
          ]
        },
        "motion": {
          "type": "string",
          "enum": [
            "system",
            "reduced",
            "full"
          ]
        },
        "userCss": {
          "type": "string",
          "maxLength": 200000,
          "x-maxBytes": 200000
        },
        "titleBarStyle": {
          "type": "string",
          "enum": [
            "system",
            "compact"
          ]
        }
      },
      "required": [
        "theme",
        "accent",
        "colors",
        "density",
        "fontSize",
        "monoFontSize",
        "monoFont",
        "motion",
        "userCss",
        "titleBarStyle"
      ],
      "additionalProperties": false
    },
    "workspace": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "title": "workspace",
      "type": "object",
      "properties": {
        "sidebarWidth": {
          "type": "integer",
          "minimum": 220,
          "maximum": 420
        },
        "rightPanel": {
          "type": "boolean"
        },
        "rightPanelWidth": {
          "type": "integer",
          "minimum": 240,
          "maximum": 460
        },
        "showStatusBar": {
          "type": "boolean"
        },
        "restore": {
          "type": "boolean"
        },
        "hostActivation": {
          "type": "string",
          "enum": [
            "terminal",
            "details",
            "edit"
          ]
        },
        "hostDirectConnect": {
          "type": "boolean"
        },
        "hostList": {
          "type": "object",
          "properties": {
            "view": {
              "type": "string",
              "enum": [
                "tree",
                "table"
              ]
            },
            "order": {
              "type": "array",
              "items": {
                "type": "string",
                "maxLength": 200
              },
              "maxItems": 256
            },
            "hidden": {
              "type": "array",
              "items": {
                "type": "string",
                "maxLength": 200
              },
              "maxItems": 256
            },
            "widths": {
              "type": "object",
              "additionalProperties": {
                "type": "integer",
                "minimum": 64,
                "maximum": 480
              },
              "maxProperties": 256,
              "propertyNames": {
                "type": "string",
                "maxLength": 256
              }
            },
            "sort": {
              "anyOf": [
                {
                  "type": "null"
                },
                {
                  "type": "object",
                  "properties": {
                    "key": {
                      "type": "string",
                      "maxLength": 200
                    },
                    "direction": {
                      "type": "string",
                      "enum": [
                        "asc",
                        "desc"
                      ]
                    }
                  },
                  "required": [
                    "key",
                    "direction"
                  ],
                  "additionalProperties": false
                }
              ]
            }
          },
          "required": [
            "view",
            "order",
            "hidden",
            "widths",
            "sort"
          ],
          "additionalProperties": false
        }
      },
      "required": [
        "sidebarWidth",
        "rightPanel",
        "rightPanelWidth",
        "showStatusBar",
        "restore",
        "hostActivation",
        "hostDirectConnect",
        "hostList"
      ],
      "additionalProperties": false
    },
    "terminal": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "title": "terminal",
      "type": "object",
      "properties": {
        "scrollback": {
          "type": "integer",
          "minimum": 1000,
          "maximum": 100000
        },
        "lineHeight": {
          "type": "number",
          "minimum": 1,
          "maximum": 1.8,
          "multipleOf": 0.1
        },
        "cursorStyle": {
          "type": "string",
          "enum": [
            "block",
            "bar",
            "underline"
          ]
        },
        "cursorBlink": {
          "type": "boolean"
        },
        "inactiveCursorStyle": {
          "type": "string",
          "enum": [
            "block",
            "bar",
            "underline",
            "outline",
            "none"
          ]
        },
        "scrollSensitivity": {
          "type": "integer",
          "minimum": 1,
          "maximum": 5
        },
        "smoothScrolling": {
          "type": "boolean"
        },
        "scrollOnInput": {
          "type": "boolean"
        },
        "copyOnSelect": {
          "type": "boolean"
        },
        "applicationClipboard": {
          "type": "boolean"
        },
        "rightClick": {
          "type": "string",
          "enum": [
            "menu",
            "copyPaste",
            "paste"
          ]
        },
        "renderer": {
          "type": "string",
          "enum": [
            "auto",
            "dom"
          ]
        },
        "recordHistory": {
          "type": "boolean"
        }
      },
      "required": [
        "scrollback",
        "lineHeight",
        "cursorStyle",
        "cursorBlink",
        "inactiveCursorStyle",
        "scrollSensitivity",
        "smoothScrolling",
        "scrollOnInput",
        "copyOnSelect",
        "applicationClipboard",
        "rightClick",
        "renderer",
        "recordHistory"
      ],
      "additionalProperties": false
    },
    "files": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "title": "files",
      "type": "object",
      "properties": {
        "showHidden": {
          "type": "boolean"
        },
        "foldersFirst": {
          "type": "boolean"
        },
        "sortBy": {
          "type": "string",
          "enum": [
            "name",
            "size",
            "modified"
          ]
        },
        "sortDirection": {
          "type": "string",
          "enum": [
            "asc",
            "desc"
          ]
        },
        "iconTheme": {
          "type": "string",
          "maxLength": 129
        },
        "preload": {
          "type": "boolean"
        },
        "preloadCount": {
          "type": "integer",
          "minimum": 0,
          "maximum": 32
        }
      },
      "required": [
        "showHidden",
        "foldersFirst",
        "sortBy",
        "sortDirection",
        "iconTheme",
        "preload",
        "preloadCount"
      ],
      "additionalProperties": false
    },
    "transfers": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "title": "transfers",
      "type": "object",
      "properties": {
        "optimization": {
          "type": "boolean"
        },
        "compression": {
          "type": "boolean"
        },
        "concurrency": {
          "type": "integer",
          "enum": [
            0,
            1,
            2,
            4,
            8
          ]
        },
        "chunkKib": {
          "type": "integer",
          "enum": [
            0,
            256,
            1024,
            4096,
            16384
          ]
        },
        "requests": {
          "type": "integer",
          "enum": [
            0,
            1,
            4,
            8,
            16,
            32
          ]
        },
        "uploadLimitKib": {
          "type": "integer",
          "minimum": 0,
          "maximum": 1048576
        },
        "downloadLimitKib": {
          "type": "integer",
          "minimum": 0,
          "maximum": 1048576
        }
      },
      "required": [
        "optimization",
        "compression",
        "concurrency",
        "chunkKib",
        "requests",
        "uploadLimitKib",
        "downloadLimitKib"
      ],
      "additionalProperties": false
    },
    "editor": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "title": "editor",
      "type": "object",
      "properties": {
        "wordWrap": {
          "type": "boolean"
        },
        "tabSize": {
          "type": "integer",
          "enum": [
            2,
            4,
            8
          ]
        },
        "spellCheck": {
          "type": "boolean"
        }
      },
      "required": [
        "wordWrap",
        "tabSize",
        "spellCheck"
      ],
      "additionalProperties": false
    },
    "monitoring": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "title": "monitoring",
      "type": "object",
      "properties": {
        "intervalMs": {
          "type": "integer",
          "enum": [
            1000,
            2000,
            3000,
            5000,
            10000,
            30000
          ]
        }
      },
      "required": [
        "intervalMs"
      ],
      "additionalProperties": false
    },
    "shortcuts": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "title": "shortcuts",
      "type": "object",
      "properties": {
        "bindings": {
          "type": "object",
          "additionalProperties": {
            "type": "array",
            "items": {
              "type": "string",
              "maxLength": 64
            },
            "maxItems": 4
          },
          "maxProperties": 128,
          "propertyNames": {
            "type": "string",
            "maxLength": 256
          }
        },
        "rules": {
          "type": "object",
          "additionalProperties": {
            "type": "object",
            "additionalProperties": {
              "type": "object",
              "properties": {
                "priority": {
                  "type": "integer",
                  "minimum": -1000,
                  "maximum": 1000
                },
                "propagation": {
                  "type": "string",
                  "enum": [
                    "consume",
                    "continue",
                    "block"
                  ]
                }
              },
              "required": [
                "priority",
                "propagation"
              ],
              "additionalProperties": false
            },
            "maxProperties": 512,
            "propertyNames": {
              "type": "string",
              "maxLength": 256
            }
          },
          "maxProperties": 512,
          "propertyNames": {
            "type": "string",
            "maxLength": 256
          }
        },
        "showDetails": {
          "type": "boolean"
        }
      },
      "required": [
        "bindings",
        "rules",
        "showDetails"
      ],
      "additionalProperties": false
    },
    "network": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "title": "network",
      "type": "object",
      "properties": {
        "profiles": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string",
                "maxLength": 128
              },
              "name": {
                "type": "string",
                "maxLength": 120
              },
              "protocol": {
                "type": "string",
                "enum": [
                  "http",
                  "socks5"
                ]
              },
              "host": {
                "type": "string",
                "maxLength": 253
              },
              "port": {
                "type": "integer",
                "minimum": 1,
                "maximum": 65535
              },
              "username": {
                "type": "string",
                "maxLength": 255
              }
            },
            "required": [
              "id",
              "name",
              "protocol",
              "host",
              "port",
              "username"
            ],
            "additionalProperties": false
          },
          "maxItems": 64
        },
        "defaultProxy": {
          "type": "string",
          "maxLength": 128
        },
        "features": {
          "type": "object",
          "additionalProperties": {
            "type": "string",
            "maxLength": 128
          },
          "maxProperties": 256,
          "propertyNames": {
            "type": "string",
            "maxLength": 256
          }
        }
      },
      "required": [
        "profiles",
        "defaultProxy",
        "features"
      ],
      "additionalProperties": false
    },
    "updates": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "title": "updates",
      "type": "object",
      "properties": {
        "autoCheck": {
          "type": "boolean"
        },
        "channel": {
          "type": "string",
          "enum": [
            "stable",
            "beta"
          ]
        },
        "source": {
          "type": "string",
          "enum": [
            "github",
            "custom"
          ]
        },
        "sourceUrl": {
          "type": "string",
          "maxLength": 2048
        },
        "interval": {
          "type": "string",
          "enum": [
            "startup",
            "daily",
            "weekly"
          ]
        }
      },
      "required": [
        "autoCheck",
        "channel",
        "source",
        "sourceUrl",
        "interval"
      ],
      "additionalProperties": false
    }
  }
};
