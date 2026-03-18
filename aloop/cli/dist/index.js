#!/usr/bin/env node
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined")
    return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/commander/lib/error.js
var require_error = __commonJS({
  "node_modules/commander/lib/error.js"(exports) {
    var CommanderError2 = class extends Error {
      /**
       * Constructs the CommanderError class
       * @param {number} exitCode suggested exit code which could be used with process.exit
       * @param {string} code an id string representing the error
       * @param {string} message human-readable description of the error
       */
      constructor(exitCode, code, message) {
        super(message);
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
        this.code = code;
        this.exitCode = exitCode;
        this.nestedError = void 0;
      }
    };
    var InvalidArgumentError2 = class extends CommanderError2 {
      /**
       * Constructs the InvalidArgumentError class
       * @param {string} [message] explanation of why argument is invalid
       */
      constructor(message) {
        super(1, "commander.invalidArgument", message);
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
      }
    };
    exports.CommanderError = CommanderError2;
    exports.InvalidArgumentError = InvalidArgumentError2;
  }
});

// node_modules/commander/lib/argument.js
var require_argument = __commonJS({
  "node_modules/commander/lib/argument.js"(exports) {
    var { InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var Argument2 = class {
      /**
       * Initialize a new command argument with the given name and description.
       * The default is that the argument is required, and you can explicitly
       * indicate this with <> around the name. Put [] around the name for an optional argument.
       *
       * @param {string} name
       * @param {string} [description]
       */
      constructor(name, description) {
        this.description = description || "";
        this.variadic = false;
        this.parseArg = void 0;
        this.defaultValue = void 0;
        this.defaultValueDescription = void 0;
        this.argChoices = void 0;
        switch (name[0]) {
          case "<":
            this.required = true;
            this._name = name.slice(1, -1);
            break;
          case "[":
            this.required = false;
            this._name = name.slice(1, -1);
            break;
          default:
            this.required = true;
            this._name = name;
            break;
        }
        if (this._name.length > 3 && this._name.slice(-3) === "...") {
          this.variadic = true;
          this._name = this._name.slice(0, -3);
        }
      }
      /**
       * Return argument name.
       *
       * @return {string}
       */
      name() {
        return this._name;
      }
      /**
       * @package
       */
      _concatValue(value, previous) {
        if (previous === this.defaultValue || !Array.isArray(previous)) {
          return [value];
        }
        return previous.concat(value);
      }
      /**
       * Set the default value, and optionally supply the description to be displayed in the help.
       *
       * @param {*} value
       * @param {string} [description]
       * @return {Argument}
       */
      default(value, description) {
        this.defaultValue = value;
        this.defaultValueDescription = description;
        return this;
      }
      /**
       * Set the custom handler for processing CLI command arguments into argument values.
       *
       * @param {Function} [fn]
       * @return {Argument}
       */
      argParser(fn) {
        this.parseArg = fn;
        return this;
      }
      /**
       * Only allow argument value to be one of choices.
       *
       * @param {string[]} values
       * @return {Argument}
       */
      choices(values) {
        this.argChoices = values.slice();
        this.parseArg = (arg, previous) => {
          if (!this.argChoices.includes(arg)) {
            throw new InvalidArgumentError2(
              `Allowed choices are ${this.argChoices.join(", ")}.`
            );
          }
          if (this.variadic) {
            return this._concatValue(arg, previous);
          }
          return arg;
        };
        return this;
      }
      /**
       * Make argument required.
       *
       * @returns {Argument}
       */
      argRequired() {
        this.required = true;
        return this;
      }
      /**
       * Make argument optional.
       *
       * @returns {Argument}
       */
      argOptional() {
        this.required = false;
        return this;
      }
    };
    function humanReadableArgName(arg) {
      const nameOutput = arg.name() + (arg.variadic === true ? "..." : "");
      return arg.required ? "<" + nameOutput + ">" : "[" + nameOutput + "]";
    }
    exports.Argument = Argument2;
    exports.humanReadableArgName = humanReadableArgName;
  }
});

// node_modules/commander/lib/help.js
var require_help = __commonJS({
  "node_modules/commander/lib/help.js"(exports) {
    var { humanReadableArgName } = require_argument();
    var Help2 = class {
      constructor() {
        this.helpWidth = void 0;
        this.sortSubcommands = false;
        this.sortOptions = false;
        this.showGlobalOptions = false;
      }
      /**
       * Get an array of the visible subcommands. Includes a placeholder for the implicit help command, if there is one.
       *
       * @param {Command} cmd
       * @returns {Command[]}
       */
      visibleCommands(cmd) {
        const visibleCommands = cmd.commands.filter((cmd2) => !cmd2._hidden);
        const helpCommand = cmd._getHelpCommand();
        if (helpCommand && !helpCommand._hidden) {
          visibleCommands.push(helpCommand);
        }
        if (this.sortSubcommands) {
          visibleCommands.sort((a, b) => {
            return a.name().localeCompare(b.name());
          });
        }
        return visibleCommands;
      }
      /**
       * Compare options for sort.
       *
       * @param {Option} a
       * @param {Option} b
       * @returns {number}
       */
      compareOptions(a, b) {
        const getSortKey = (option) => {
          return option.short ? option.short.replace(/^-/, "") : option.long.replace(/^--/, "");
        };
        return getSortKey(a).localeCompare(getSortKey(b));
      }
      /**
       * Get an array of the visible options. Includes a placeholder for the implicit help option, if there is one.
       *
       * @param {Command} cmd
       * @returns {Option[]}
       */
      visibleOptions(cmd) {
        const visibleOptions = cmd.options.filter((option) => !option.hidden);
        const helpOption = cmd._getHelpOption();
        if (helpOption && !helpOption.hidden) {
          const removeShort = helpOption.short && cmd._findOption(helpOption.short);
          const removeLong = helpOption.long && cmd._findOption(helpOption.long);
          if (!removeShort && !removeLong) {
            visibleOptions.push(helpOption);
          } else if (helpOption.long && !removeLong) {
            visibleOptions.push(
              cmd.createOption(helpOption.long, helpOption.description)
            );
          } else if (helpOption.short && !removeShort) {
            visibleOptions.push(
              cmd.createOption(helpOption.short, helpOption.description)
            );
          }
        }
        if (this.sortOptions) {
          visibleOptions.sort(this.compareOptions);
        }
        return visibleOptions;
      }
      /**
       * Get an array of the visible global options. (Not including help.)
       *
       * @param {Command} cmd
       * @returns {Option[]}
       */
      visibleGlobalOptions(cmd) {
        if (!this.showGlobalOptions)
          return [];
        const globalOptions = [];
        for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
          const visibleOptions = ancestorCmd.options.filter(
            (option) => !option.hidden
          );
          globalOptions.push(...visibleOptions);
        }
        if (this.sortOptions) {
          globalOptions.sort(this.compareOptions);
        }
        return globalOptions;
      }
      /**
       * Get an array of the arguments if any have a description.
       *
       * @param {Command} cmd
       * @returns {Argument[]}
       */
      visibleArguments(cmd) {
        if (cmd._argsDescription) {
          cmd.registeredArguments.forEach((argument) => {
            argument.description = argument.description || cmd._argsDescription[argument.name()] || "";
          });
        }
        if (cmd.registeredArguments.find((argument) => argument.description)) {
          return cmd.registeredArguments;
        }
        return [];
      }
      /**
       * Get the command term to show in the list of subcommands.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      subcommandTerm(cmd) {
        const args = cmd.registeredArguments.map((arg) => humanReadableArgName(arg)).join(" ");
        return cmd._name + (cmd._aliases[0] ? "|" + cmd._aliases[0] : "") + (cmd.options.length ? " [options]" : "") + // simplistic check for non-help option
        (args ? " " + args : "");
      }
      /**
       * Get the option term to show in the list of options.
       *
       * @param {Option} option
       * @returns {string}
       */
      optionTerm(option) {
        return option.flags;
      }
      /**
       * Get the argument term to show in the list of arguments.
       *
       * @param {Argument} argument
       * @returns {string}
       */
      argumentTerm(argument) {
        return argument.name();
      }
      /**
       * Get the longest command term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestSubcommandTermLength(cmd, helper) {
        return helper.visibleCommands(cmd).reduce((max, command) => {
          return Math.max(max, helper.subcommandTerm(command).length);
        }, 0);
      }
      /**
       * Get the longest option term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestOptionTermLength(cmd, helper) {
        return helper.visibleOptions(cmd).reduce((max, option) => {
          return Math.max(max, helper.optionTerm(option).length);
        }, 0);
      }
      /**
       * Get the longest global option term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestGlobalOptionTermLength(cmd, helper) {
        return helper.visibleGlobalOptions(cmd).reduce((max, option) => {
          return Math.max(max, helper.optionTerm(option).length);
        }, 0);
      }
      /**
       * Get the longest argument term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestArgumentTermLength(cmd, helper) {
        return helper.visibleArguments(cmd).reduce((max, argument) => {
          return Math.max(max, helper.argumentTerm(argument).length);
        }, 0);
      }
      /**
       * Get the command usage to be displayed at the top of the built-in help.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      commandUsage(cmd) {
        let cmdName = cmd._name;
        if (cmd._aliases[0]) {
          cmdName = cmdName + "|" + cmd._aliases[0];
        }
        let ancestorCmdNames = "";
        for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
          ancestorCmdNames = ancestorCmd.name() + " " + ancestorCmdNames;
        }
        return ancestorCmdNames + cmdName + " " + cmd.usage();
      }
      /**
       * Get the description for the command.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      commandDescription(cmd) {
        return cmd.description();
      }
      /**
       * Get the subcommand summary to show in the list of subcommands.
       * (Fallback to description for backwards compatibility.)
       *
       * @param {Command} cmd
       * @returns {string}
       */
      subcommandDescription(cmd) {
        return cmd.summary() || cmd.description();
      }
      /**
       * Get the option description to show in the list of options.
       *
       * @param {Option} option
       * @return {string}
       */
      optionDescription(option) {
        const extraInfo = [];
        if (option.argChoices) {
          extraInfo.push(
            // use stringify to match the display of the default value
            `choices: ${option.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
          );
        }
        if (option.defaultValue !== void 0) {
          const showDefault = option.required || option.optional || option.isBoolean() && typeof option.defaultValue === "boolean";
          if (showDefault) {
            extraInfo.push(
              `default: ${option.defaultValueDescription || JSON.stringify(option.defaultValue)}`
            );
          }
        }
        if (option.presetArg !== void 0 && option.optional) {
          extraInfo.push(`preset: ${JSON.stringify(option.presetArg)}`);
        }
        if (option.envVar !== void 0) {
          extraInfo.push(`env: ${option.envVar}`);
        }
        if (extraInfo.length > 0) {
          return `${option.description} (${extraInfo.join(", ")})`;
        }
        return option.description;
      }
      /**
       * Get the argument description to show in the list of arguments.
       *
       * @param {Argument} argument
       * @return {string}
       */
      argumentDescription(argument) {
        const extraInfo = [];
        if (argument.argChoices) {
          extraInfo.push(
            // use stringify to match the display of the default value
            `choices: ${argument.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
          );
        }
        if (argument.defaultValue !== void 0) {
          extraInfo.push(
            `default: ${argument.defaultValueDescription || JSON.stringify(argument.defaultValue)}`
          );
        }
        if (extraInfo.length > 0) {
          const extraDescripton = `(${extraInfo.join(", ")})`;
          if (argument.description) {
            return `${argument.description} ${extraDescripton}`;
          }
          return extraDescripton;
        }
        return argument.description;
      }
      /**
       * Generate the built-in help text.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {string}
       */
      formatHelp(cmd, helper) {
        const termWidth = helper.padWidth(cmd, helper);
        const helpWidth = helper.helpWidth || 80;
        const itemIndentWidth = 2;
        const itemSeparatorWidth = 2;
        function formatItem(term, description) {
          if (description) {
            const fullText = `${term.padEnd(termWidth + itemSeparatorWidth)}${description}`;
            return helper.wrap(
              fullText,
              helpWidth - itemIndentWidth,
              termWidth + itemSeparatorWidth
            );
          }
          return term;
        }
        function formatList(textArray) {
          return textArray.join("\n").replace(/^/gm, " ".repeat(itemIndentWidth));
        }
        let output = [`Usage: ${helper.commandUsage(cmd)}`, ""];
        const commandDescription = helper.commandDescription(cmd);
        if (commandDescription.length > 0) {
          output = output.concat([
            helper.wrap(commandDescription, helpWidth, 0),
            ""
          ]);
        }
        const argumentList = helper.visibleArguments(cmd).map((argument) => {
          return formatItem(
            helper.argumentTerm(argument),
            helper.argumentDescription(argument)
          );
        });
        if (argumentList.length > 0) {
          output = output.concat(["Arguments:", formatList(argumentList), ""]);
        }
        const optionList = helper.visibleOptions(cmd).map((option) => {
          return formatItem(
            helper.optionTerm(option),
            helper.optionDescription(option)
          );
        });
        if (optionList.length > 0) {
          output = output.concat(["Options:", formatList(optionList), ""]);
        }
        if (this.showGlobalOptions) {
          const globalOptionList = helper.visibleGlobalOptions(cmd).map((option) => {
            return formatItem(
              helper.optionTerm(option),
              helper.optionDescription(option)
            );
          });
          if (globalOptionList.length > 0) {
            output = output.concat([
              "Global Options:",
              formatList(globalOptionList),
              ""
            ]);
          }
        }
        const commandList = helper.visibleCommands(cmd).map((cmd2) => {
          return formatItem(
            helper.subcommandTerm(cmd2),
            helper.subcommandDescription(cmd2)
          );
        });
        if (commandList.length > 0) {
          output = output.concat(["Commands:", formatList(commandList), ""]);
        }
        return output.join("\n");
      }
      /**
       * Calculate the pad width from the maximum term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      padWidth(cmd, helper) {
        return Math.max(
          helper.longestOptionTermLength(cmd, helper),
          helper.longestGlobalOptionTermLength(cmd, helper),
          helper.longestSubcommandTermLength(cmd, helper),
          helper.longestArgumentTermLength(cmd, helper)
        );
      }
      /**
       * Wrap the given string to width characters per line, with lines after the first indented.
       * Do not wrap if insufficient room for wrapping (minColumnWidth), or string is manually formatted.
       *
       * @param {string} str
       * @param {number} width
       * @param {number} indent
       * @param {number} [minColumnWidth=40]
       * @return {string}
       *
       */
      wrap(str, width, indent, minColumnWidth = 40) {
        const indents = " \\f\\t\\v\xA0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF";
        const manualIndent = new RegExp(`[\\n][${indents}]+`);
        if (str.match(manualIndent))
          return str;
        const columnWidth = width - indent;
        if (columnWidth < minColumnWidth)
          return str;
        const leadingStr = str.slice(0, indent);
        const columnText = str.slice(indent).replace("\r\n", "\n");
        const indentString = " ".repeat(indent);
        const zeroWidthSpace = "\u200B";
        const breaks = `\\s${zeroWidthSpace}`;
        const regex = new RegExp(
          `
|.{1,${columnWidth - 1}}([${breaks}]|$)|[^${breaks}]+?([${breaks}]|$)`,
          "g"
        );
        const lines = columnText.match(regex) || [];
        return leadingStr + lines.map((line, i) => {
          if (line === "\n")
            return "";
          return (i > 0 ? indentString : "") + line.trimEnd();
        }).join("\n");
      }
    };
    exports.Help = Help2;
  }
});

// node_modules/commander/lib/option.js
var require_option = __commonJS({
  "node_modules/commander/lib/option.js"(exports) {
    var { InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var Option2 = class {
      /**
       * Initialize a new `Option` with the given `flags` and `description`.
       *
       * @param {string} flags
       * @param {string} [description]
       */
      constructor(flags, description) {
        this.flags = flags;
        this.description = description || "";
        this.required = flags.includes("<");
        this.optional = flags.includes("[");
        this.variadic = /\w\.\.\.[>\]]$/.test(flags);
        this.mandatory = false;
        const optionFlags = splitOptionFlags(flags);
        this.short = optionFlags.shortFlag;
        this.long = optionFlags.longFlag;
        this.negate = false;
        if (this.long) {
          this.negate = this.long.startsWith("--no-");
        }
        this.defaultValue = void 0;
        this.defaultValueDescription = void 0;
        this.presetArg = void 0;
        this.envVar = void 0;
        this.parseArg = void 0;
        this.hidden = false;
        this.argChoices = void 0;
        this.conflictsWith = [];
        this.implied = void 0;
      }
      /**
       * Set the default value, and optionally supply the description to be displayed in the help.
       *
       * @param {*} value
       * @param {string} [description]
       * @return {Option}
       */
      default(value, description) {
        this.defaultValue = value;
        this.defaultValueDescription = description;
        return this;
      }
      /**
       * Preset to use when option used without option-argument, especially optional but also boolean and negated.
       * The custom processing (parseArg) is called.
       *
       * @example
       * new Option('--color').default('GREYSCALE').preset('RGB');
       * new Option('--donate [amount]').preset('20').argParser(parseFloat);
       *
       * @param {*} arg
       * @return {Option}
       */
      preset(arg) {
        this.presetArg = arg;
        return this;
      }
      /**
       * Add option name(s) that conflict with this option.
       * An error will be displayed if conflicting options are found during parsing.
       *
       * @example
       * new Option('--rgb').conflicts('cmyk');
       * new Option('--js').conflicts(['ts', 'jsx']);
       *
       * @param {(string | string[])} names
       * @return {Option}
       */
      conflicts(names) {
        this.conflictsWith = this.conflictsWith.concat(names);
        return this;
      }
      /**
       * Specify implied option values for when this option is set and the implied options are not.
       *
       * The custom processing (parseArg) is not called on the implied values.
       *
       * @example
       * program
       *   .addOption(new Option('--log', 'write logging information to file'))
       *   .addOption(new Option('--trace', 'log extra details').implies({ log: 'trace.txt' }));
       *
       * @param {object} impliedOptionValues
       * @return {Option}
       */
      implies(impliedOptionValues) {
        let newImplied = impliedOptionValues;
        if (typeof impliedOptionValues === "string") {
          newImplied = { [impliedOptionValues]: true };
        }
        this.implied = Object.assign(this.implied || {}, newImplied);
        return this;
      }
      /**
       * Set environment variable to check for option value.
       *
       * An environment variable is only used if when processed the current option value is
       * undefined, or the source of the current value is 'default' or 'config' or 'env'.
       *
       * @param {string} name
       * @return {Option}
       */
      env(name) {
        this.envVar = name;
        return this;
      }
      /**
       * Set the custom handler for processing CLI option arguments into option values.
       *
       * @param {Function} [fn]
       * @return {Option}
       */
      argParser(fn) {
        this.parseArg = fn;
        return this;
      }
      /**
       * Whether the option is mandatory and must have a value after parsing.
       *
       * @param {boolean} [mandatory=true]
       * @return {Option}
       */
      makeOptionMandatory(mandatory = true) {
        this.mandatory = !!mandatory;
        return this;
      }
      /**
       * Hide option in help.
       *
       * @param {boolean} [hide=true]
       * @return {Option}
       */
      hideHelp(hide = true) {
        this.hidden = !!hide;
        return this;
      }
      /**
       * @package
       */
      _concatValue(value, previous) {
        if (previous === this.defaultValue || !Array.isArray(previous)) {
          return [value];
        }
        return previous.concat(value);
      }
      /**
       * Only allow option value to be one of choices.
       *
       * @param {string[]} values
       * @return {Option}
       */
      choices(values) {
        this.argChoices = values.slice();
        this.parseArg = (arg, previous) => {
          if (!this.argChoices.includes(arg)) {
            throw new InvalidArgumentError2(
              `Allowed choices are ${this.argChoices.join(", ")}.`
            );
          }
          if (this.variadic) {
            return this._concatValue(arg, previous);
          }
          return arg;
        };
        return this;
      }
      /**
       * Return option name.
       *
       * @return {string}
       */
      name() {
        if (this.long) {
          return this.long.replace(/^--/, "");
        }
        return this.short.replace(/^-/, "");
      }
      /**
       * Return option name, in a camelcase format that can be used
       * as a object attribute key.
       *
       * @return {string}
       */
      attributeName() {
        return camelcase(this.name().replace(/^no-/, ""));
      }
      /**
       * Check if `arg` matches the short or long flag.
       *
       * @param {string} arg
       * @return {boolean}
       * @package
       */
      is(arg) {
        return this.short === arg || this.long === arg;
      }
      /**
       * Return whether a boolean option.
       *
       * Options are one of boolean, negated, required argument, or optional argument.
       *
       * @return {boolean}
       * @package
       */
      isBoolean() {
        return !this.required && !this.optional && !this.negate;
      }
    };
    var DualOptions = class {
      /**
       * @param {Option[]} options
       */
      constructor(options) {
        this.positiveOptions = /* @__PURE__ */ new Map();
        this.negativeOptions = /* @__PURE__ */ new Map();
        this.dualOptions = /* @__PURE__ */ new Set();
        options.forEach((option) => {
          if (option.negate) {
            this.negativeOptions.set(option.attributeName(), option);
          } else {
            this.positiveOptions.set(option.attributeName(), option);
          }
        });
        this.negativeOptions.forEach((value, key) => {
          if (this.positiveOptions.has(key)) {
            this.dualOptions.add(key);
          }
        });
      }
      /**
       * Did the value come from the option, and not from possible matching dual option?
       *
       * @param {*} value
       * @param {Option} option
       * @returns {boolean}
       */
      valueFromOption(value, option) {
        const optionKey = option.attributeName();
        if (!this.dualOptions.has(optionKey))
          return true;
        const preset = this.negativeOptions.get(optionKey).presetArg;
        const negativeValue = preset !== void 0 ? preset : false;
        return option.negate === (negativeValue === value);
      }
    };
    function camelcase(str) {
      return str.split("-").reduce((str2, word) => {
        return str2 + word[0].toUpperCase() + word.slice(1);
      });
    }
    function splitOptionFlags(flags) {
      let shortFlag;
      let longFlag;
      const flagParts = flags.split(/[ |,]+/);
      if (flagParts.length > 1 && !/^[[<]/.test(flagParts[1]))
        shortFlag = flagParts.shift();
      longFlag = flagParts.shift();
      if (!shortFlag && /^-[^-]$/.test(longFlag)) {
        shortFlag = longFlag;
        longFlag = void 0;
      }
      return { shortFlag, longFlag };
    }
    exports.Option = Option2;
    exports.DualOptions = DualOptions;
  }
});

// node_modules/commander/lib/suggestSimilar.js
var require_suggestSimilar = __commonJS({
  "node_modules/commander/lib/suggestSimilar.js"(exports) {
    var maxDistance = 3;
    function editDistance(a, b) {
      if (Math.abs(a.length - b.length) > maxDistance)
        return Math.max(a.length, b.length);
      const d = [];
      for (let i = 0; i <= a.length; i++) {
        d[i] = [i];
      }
      for (let j = 0; j <= b.length; j++) {
        d[0][j] = j;
      }
      for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
          let cost = 1;
          if (a[i - 1] === b[j - 1]) {
            cost = 0;
          } else {
            cost = 1;
          }
          d[i][j] = Math.min(
            d[i - 1][j] + 1,
            // deletion
            d[i][j - 1] + 1,
            // insertion
            d[i - 1][j - 1] + cost
            // substitution
          );
          if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
            d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
          }
        }
      }
      return d[a.length][b.length];
    }
    function suggestSimilar(word, candidates) {
      if (!candidates || candidates.length === 0)
        return "";
      candidates = Array.from(new Set(candidates));
      const searchingOptions = word.startsWith("--");
      if (searchingOptions) {
        word = word.slice(2);
        candidates = candidates.map((candidate) => candidate.slice(2));
      }
      let similar = [];
      let bestDistance = maxDistance;
      const minSimilarity = 0.4;
      candidates.forEach((candidate) => {
        if (candidate.length <= 1)
          return;
        const distance = editDistance(word, candidate);
        const length = Math.max(word.length, candidate.length);
        const similarity = (length - distance) / length;
        if (similarity > minSimilarity) {
          if (distance < bestDistance) {
            bestDistance = distance;
            similar = [candidate];
          } else if (distance === bestDistance) {
            similar.push(candidate);
          }
        }
      });
      similar.sort((a, b) => a.localeCompare(b));
      if (searchingOptions) {
        similar = similar.map((candidate) => `--${candidate}`);
      }
      if (similar.length > 1) {
        return `
(Did you mean one of ${similar.join(", ")}?)`;
      }
      if (similar.length === 1) {
        return `
(Did you mean ${similar[0]}?)`;
      }
      return "";
    }
    exports.suggestSimilar = suggestSimilar;
  }
});

// node_modules/commander/lib/command.js
var require_command = __commonJS({
  "node_modules/commander/lib/command.js"(exports) {
    var EventEmitter = __require("node:events").EventEmitter;
    var childProcess = __require("node:child_process");
    var path16 = __require("node:path");
    var fs7 = __require("node:fs");
    var process2 = __require("node:process");
    var { Argument: Argument2, humanReadableArgName } = require_argument();
    var { CommanderError: CommanderError2 } = require_error();
    var { Help: Help2 } = require_help();
    var { Option: Option2, DualOptions } = require_option();
    var { suggestSimilar } = require_suggestSimilar();
    var Command2 = class _Command extends EventEmitter {
      /**
       * Initialize a new `Command`.
       *
       * @param {string} [name]
       */
      constructor(name) {
        super();
        this.commands = [];
        this.options = [];
        this.parent = null;
        this._allowUnknownOption = false;
        this._allowExcessArguments = true;
        this.registeredArguments = [];
        this._args = this.registeredArguments;
        this.args = [];
        this.rawArgs = [];
        this.processedArgs = [];
        this._scriptPath = null;
        this._name = name || "";
        this._optionValues = {};
        this._optionValueSources = {};
        this._storeOptionsAsProperties = false;
        this._actionHandler = null;
        this._executableHandler = false;
        this._executableFile = null;
        this._executableDir = null;
        this._defaultCommandName = null;
        this._exitCallback = null;
        this._aliases = [];
        this._combineFlagAndOptionalValue = true;
        this._description = "";
        this._summary = "";
        this._argsDescription = void 0;
        this._enablePositionalOptions = false;
        this._passThroughOptions = false;
        this._lifeCycleHooks = {};
        this._showHelpAfterError = false;
        this._showSuggestionAfterError = true;
        this._outputConfiguration = {
          writeOut: (str) => process2.stdout.write(str),
          writeErr: (str) => process2.stderr.write(str),
          getOutHelpWidth: () => process2.stdout.isTTY ? process2.stdout.columns : void 0,
          getErrHelpWidth: () => process2.stderr.isTTY ? process2.stderr.columns : void 0,
          outputError: (str, write) => write(str)
        };
        this._hidden = false;
        this._helpOption = void 0;
        this._addImplicitHelpCommand = void 0;
        this._helpCommand = void 0;
        this._helpConfiguration = {};
      }
      /**
       * Copy settings that are useful to have in common across root command and subcommands.
       *
       * (Used internally when adding a command using `.command()` so subcommands inherit parent settings.)
       *
       * @param {Command} sourceCommand
       * @return {Command} `this` command for chaining
       */
      copyInheritedSettings(sourceCommand) {
        this._outputConfiguration = sourceCommand._outputConfiguration;
        this._helpOption = sourceCommand._helpOption;
        this._helpCommand = sourceCommand._helpCommand;
        this._helpConfiguration = sourceCommand._helpConfiguration;
        this._exitCallback = sourceCommand._exitCallback;
        this._storeOptionsAsProperties = sourceCommand._storeOptionsAsProperties;
        this._combineFlagAndOptionalValue = sourceCommand._combineFlagAndOptionalValue;
        this._allowExcessArguments = sourceCommand._allowExcessArguments;
        this._enablePositionalOptions = sourceCommand._enablePositionalOptions;
        this._showHelpAfterError = sourceCommand._showHelpAfterError;
        this._showSuggestionAfterError = sourceCommand._showSuggestionAfterError;
        return this;
      }
      /**
       * @returns {Command[]}
       * @private
       */
      _getCommandAndAncestors() {
        const result = [];
        for (let command = this; command; command = command.parent) {
          result.push(command);
        }
        return result;
      }
      /**
       * Define a command.
       *
       * There are two styles of command: pay attention to where to put the description.
       *
       * @example
       * // Command implemented using action handler (description is supplied separately to `.command`)
       * program
       *   .command('clone <source> [destination]')
       *   .description('clone a repository into a newly created directory')
       *   .action((source, destination) => {
       *     console.log('clone command called');
       *   });
       *
       * // Command implemented using separate executable file (description is second parameter to `.command`)
       * program
       *   .command('start <service>', 'start named service')
       *   .command('stop [service]', 'stop named service, or all if no name supplied');
       *
       * @param {string} nameAndArgs - command name and arguments, args are `<required>` or `[optional]` and last may also be `variadic...`
       * @param {(object | string)} [actionOptsOrExecDesc] - configuration options (for action), or description (for executable)
       * @param {object} [execOpts] - configuration options (for executable)
       * @return {Command} returns new command for action handler, or `this` for executable command
       */
      command(nameAndArgs, actionOptsOrExecDesc, execOpts) {
        let desc = actionOptsOrExecDesc;
        let opts = execOpts;
        if (typeof desc === "object" && desc !== null) {
          opts = desc;
          desc = null;
        }
        opts = opts || {};
        const [, name, args] = nameAndArgs.match(/([^ ]+) *(.*)/);
        const cmd = this.createCommand(name);
        if (desc) {
          cmd.description(desc);
          cmd._executableHandler = true;
        }
        if (opts.isDefault)
          this._defaultCommandName = cmd._name;
        cmd._hidden = !!(opts.noHelp || opts.hidden);
        cmd._executableFile = opts.executableFile || null;
        if (args)
          cmd.arguments(args);
        this._registerCommand(cmd);
        cmd.parent = this;
        cmd.copyInheritedSettings(this);
        if (desc)
          return this;
        return cmd;
      }
      /**
       * Factory routine to create a new unattached command.
       *
       * See .command() for creating an attached subcommand, which uses this routine to
       * create the command. You can override createCommand to customise subcommands.
       *
       * @param {string} [name]
       * @return {Command} new command
       */
      createCommand(name) {
        return new _Command(name);
      }
      /**
       * You can customise the help with a subclass of Help by overriding createHelp,
       * or by overriding Help properties using configureHelp().
       *
       * @return {Help}
       */
      createHelp() {
        return Object.assign(new Help2(), this.configureHelp());
      }
      /**
       * You can customise the help by overriding Help properties using configureHelp(),
       * or with a subclass of Help by overriding createHelp().
       *
       * @param {object} [configuration] - configuration options
       * @return {(Command | object)} `this` command for chaining, or stored configuration
       */
      configureHelp(configuration) {
        if (configuration === void 0)
          return this._helpConfiguration;
        this._helpConfiguration = configuration;
        return this;
      }
      /**
       * The default output goes to stdout and stderr. You can customise this for special
       * applications. You can also customise the display of errors by overriding outputError.
       *
       * The configuration properties are all functions:
       *
       *     // functions to change where being written, stdout and stderr
       *     writeOut(str)
       *     writeErr(str)
       *     // matching functions to specify width for wrapping help
       *     getOutHelpWidth()
       *     getErrHelpWidth()
       *     // functions based on what is being written out
       *     outputError(str, write) // used for displaying errors, and not used for displaying help
       *
       * @param {object} [configuration] - configuration options
       * @return {(Command | object)} `this` command for chaining, or stored configuration
       */
      configureOutput(configuration) {
        if (configuration === void 0)
          return this._outputConfiguration;
        Object.assign(this._outputConfiguration, configuration);
        return this;
      }
      /**
       * Display the help or a custom message after an error occurs.
       *
       * @param {(boolean|string)} [displayHelp]
       * @return {Command} `this` command for chaining
       */
      showHelpAfterError(displayHelp = true) {
        if (typeof displayHelp !== "string")
          displayHelp = !!displayHelp;
        this._showHelpAfterError = displayHelp;
        return this;
      }
      /**
       * Display suggestion of similar commands for unknown commands, or options for unknown options.
       *
       * @param {boolean} [displaySuggestion]
       * @return {Command} `this` command for chaining
       */
      showSuggestionAfterError(displaySuggestion = true) {
        this._showSuggestionAfterError = !!displaySuggestion;
        return this;
      }
      /**
       * Add a prepared subcommand.
       *
       * See .command() for creating an attached subcommand which inherits settings from its parent.
       *
       * @param {Command} cmd - new subcommand
       * @param {object} [opts] - configuration options
       * @return {Command} `this` command for chaining
       */
      addCommand(cmd, opts) {
        if (!cmd._name) {
          throw new Error(`Command passed to .addCommand() must have a name
- specify the name in Command constructor or using .name()`);
        }
        opts = opts || {};
        if (opts.isDefault)
          this._defaultCommandName = cmd._name;
        if (opts.noHelp || opts.hidden)
          cmd._hidden = true;
        this._registerCommand(cmd);
        cmd.parent = this;
        cmd._checkForBrokenPassThrough();
        return this;
      }
      /**
       * Factory routine to create a new unattached argument.
       *
       * See .argument() for creating an attached argument, which uses this routine to
       * create the argument. You can override createArgument to return a custom argument.
       *
       * @param {string} name
       * @param {string} [description]
       * @return {Argument} new argument
       */
      createArgument(name, description) {
        return new Argument2(name, description);
      }
      /**
       * Define argument syntax for command.
       *
       * The default is that the argument is required, and you can explicitly
       * indicate this with <> around the name. Put [] around the name for an optional argument.
       *
       * @example
       * program.argument('<input-file>');
       * program.argument('[output-file]');
       *
       * @param {string} name
       * @param {string} [description]
       * @param {(Function|*)} [fn] - custom argument processing function
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      argument(name, description, fn, defaultValue) {
        const argument = this.createArgument(name, description);
        if (typeof fn === "function") {
          argument.default(defaultValue).argParser(fn);
        } else {
          argument.default(fn);
        }
        this.addArgument(argument);
        return this;
      }
      /**
       * Define argument syntax for command, adding multiple at once (without descriptions).
       *
       * See also .argument().
       *
       * @example
       * program.arguments('<cmd> [env]');
       *
       * @param {string} names
       * @return {Command} `this` command for chaining
       */
      arguments(names) {
        names.trim().split(/ +/).forEach((detail) => {
          this.argument(detail);
        });
        return this;
      }
      /**
       * Define argument syntax for command, adding a prepared argument.
       *
       * @param {Argument} argument
       * @return {Command} `this` command for chaining
       */
      addArgument(argument) {
        const previousArgument = this.registeredArguments.slice(-1)[0];
        if (previousArgument && previousArgument.variadic) {
          throw new Error(
            `only the last argument can be variadic '${previousArgument.name()}'`
          );
        }
        if (argument.required && argument.defaultValue !== void 0 && argument.parseArg === void 0) {
          throw new Error(
            `a default value for a required argument is never used: '${argument.name()}'`
          );
        }
        this.registeredArguments.push(argument);
        return this;
      }
      /**
       * Customise or override default help command. By default a help command is automatically added if your command has subcommands.
       *
       * @example
       *    program.helpCommand('help [cmd]');
       *    program.helpCommand('help [cmd]', 'show help');
       *    program.helpCommand(false); // suppress default help command
       *    program.helpCommand(true); // add help command even if no subcommands
       *
       * @param {string|boolean} enableOrNameAndArgs - enable with custom name and/or arguments, or boolean to override whether added
       * @param {string} [description] - custom description
       * @return {Command} `this` command for chaining
       */
      helpCommand(enableOrNameAndArgs, description) {
        if (typeof enableOrNameAndArgs === "boolean") {
          this._addImplicitHelpCommand = enableOrNameAndArgs;
          return this;
        }
        enableOrNameAndArgs = enableOrNameAndArgs ?? "help [command]";
        const [, helpName, helpArgs] = enableOrNameAndArgs.match(/([^ ]+) *(.*)/);
        const helpDescription = description ?? "display help for command";
        const helpCommand = this.createCommand(helpName);
        helpCommand.helpOption(false);
        if (helpArgs)
          helpCommand.arguments(helpArgs);
        if (helpDescription)
          helpCommand.description(helpDescription);
        this._addImplicitHelpCommand = true;
        this._helpCommand = helpCommand;
        return this;
      }
      /**
       * Add prepared custom help command.
       *
       * @param {(Command|string|boolean)} helpCommand - custom help command, or deprecated enableOrNameAndArgs as for `.helpCommand()`
       * @param {string} [deprecatedDescription] - deprecated custom description used with custom name only
       * @return {Command} `this` command for chaining
       */
      addHelpCommand(helpCommand, deprecatedDescription) {
        if (typeof helpCommand !== "object") {
          this.helpCommand(helpCommand, deprecatedDescription);
          return this;
        }
        this._addImplicitHelpCommand = true;
        this._helpCommand = helpCommand;
        return this;
      }
      /**
       * Lazy create help command.
       *
       * @return {(Command|null)}
       * @package
       */
      _getHelpCommand() {
        const hasImplicitHelpCommand = this._addImplicitHelpCommand ?? (this.commands.length && !this._actionHandler && !this._findCommand("help"));
        if (hasImplicitHelpCommand) {
          if (this._helpCommand === void 0) {
            this.helpCommand(void 0, void 0);
          }
          return this._helpCommand;
        }
        return null;
      }
      /**
       * Add hook for life cycle event.
       *
       * @param {string} event
       * @param {Function} listener
       * @return {Command} `this` command for chaining
       */
      hook(event, listener) {
        const allowedValues = ["preSubcommand", "preAction", "postAction"];
        if (!allowedValues.includes(event)) {
          throw new Error(`Unexpected value for event passed to hook : '${event}'.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        if (this._lifeCycleHooks[event]) {
          this._lifeCycleHooks[event].push(listener);
        } else {
          this._lifeCycleHooks[event] = [listener];
        }
        return this;
      }
      /**
       * Register callback to use as replacement for calling process.exit.
       *
       * @param {Function} [fn] optional callback which will be passed a CommanderError, defaults to throwing
       * @return {Command} `this` command for chaining
       */
      exitOverride(fn) {
        if (fn) {
          this._exitCallback = fn;
        } else {
          this._exitCallback = (err) => {
            if (err.code !== "commander.executeSubCommandAsync") {
              throw err;
            } else {
            }
          };
        }
        return this;
      }
      /**
       * Call process.exit, and _exitCallback if defined.
       *
       * @param {number} exitCode exit code for using with process.exit
       * @param {string} code an id string representing the error
       * @param {string} message human-readable description of the error
       * @return never
       * @private
       */
      _exit(exitCode, code, message) {
        if (this._exitCallback) {
          this._exitCallback(new CommanderError2(exitCode, code, message));
        }
        process2.exit(exitCode);
      }
      /**
       * Register callback `fn` for the command.
       *
       * @example
       * program
       *   .command('serve')
       *   .description('start service')
       *   .action(function() {
       *      // do work here
       *   });
       *
       * @param {Function} fn
       * @return {Command} `this` command for chaining
       */
      action(fn) {
        const listener = (args) => {
          const expectedArgsCount = this.registeredArguments.length;
          const actionArgs = args.slice(0, expectedArgsCount);
          if (this._storeOptionsAsProperties) {
            actionArgs[expectedArgsCount] = this;
          } else {
            actionArgs[expectedArgsCount] = this.opts();
          }
          actionArgs.push(this);
          return fn.apply(this, actionArgs);
        };
        this._actionHandler = listener;
        return this;
      }
      /**
       * Factory routine to create a new unattached option.
       *
       * See .option() for creating an attached option, which uses this routine to
       * create the option. You can override createOption to return a custom option.
       *
       * @param {string} flags
       * @param {string} [description]
       * @return {Option} new option
       */
      createOption(flags, description) {
        return new Option2(flags, description);
      }
      /**
       * Wrap parseArgs to catch 'commander.invalidArgument'.
       *
       * @param {(Option | Argument)} target
       * @param {string} value
       * @param {*} previous
       * @param {string} invalidArgumentMessage
       * @private
       */
      _callParseArg(target, value, previous, invalidArgumentMessage) {
        try {
          return target.parseArg(value, previous);
        } catch (err) {
          if (err.code === "commander.invalidArgument") {
            const message = `${invalidArgumentMessage} ${err.message}`;
            this.error(message, { exitCode: err.exitCode, code: err.code });
          }
          throw err;
        }
      }
      /**
       * Check for option flag conflicts.
       * Register option if no conflicts found, or throw on conflict.
       *
       * @param {Option} option
       * @private
       */
      _registerOption(option) {
        const matchingOption = option.short && this._findOption(option.short) || option.long && this._findOption(option.long);
        if (matchingOption) {
          const matchingFlag = option.long && this._findOption(option.long) ? option.long : option.short;
          throw new Error(`Cannot add option '${option.flags}'${this._name && ` to command '${this._name}'`} due to conflicting flag '${matchingFlag}'
-  already used by option '${matchingOption.flags}'`);
        }
        this.options.push(option);
      }
      /**
       * Check for command name and alias conflicts with existing commands.
       * Register command if no conflicts found, or throw on conflict.
       *
       * @param {Command} command
       * @private
       */
      _registerCommand(command) {
        const knownBy = (cmd) => {
          return [cmd.name()].concat(cmd.aliases());
        };
        const alreadyUsed = knownBy(command).find(
          (name) => this._findCommand(name)
        );
        if (alreadyUsed) {
          const existingCmd = knownBy(this._findCommand(alreadyUsed)).join("|");
          const newCmd = knownBy(command).join("|");
          throw new Error(
            `cannot add command '${newCmd}' as already have command '${existingCmd}'`
          );
        }
        this.commands.push(command);
      }
      /**
       * Add an option.
       *
       * @param {Option} option
       * @return {Command} `this` command for chaining
       */
      addOption(option) {
        this._registerOption(option);
        const oname = option.name();
        const name = option.attributeName();
        if (option.negate) {
          const positiveLongFlag = option.long.replace(/^--no-/, "--");
          if (!this._findOption(positiveLongFlag)) {
            this.setOptionValueWithSource(
              name,
              option.defaultValue === void 0 ? true : option.defaultValue,
              "default"
            );
          }
        } else if (option.defaultValue !== void 0) {
          this.setOptionValueWithSource(name, option.defaultValue, "default");
        }
        const handleOptionValue = (val, invalidValueMessage, valueSource) => {
          if (val == null && option.presetArg !== void 0) {
            val = option.presetArg;
          }
          const oldValue = this.getOptionValue(name);
          if (val !== null && option.parseArg) {
            val = this._callParseArg(option, val, oldValue, invalidValueMessage);
          } else if (val !== null && option.variadic) {
            val = option._concatValue(val, oldValue);
          }
          if (val == null) {
            if (option.negate) {
              val = false;
            } else if (option.isBoolean() || option.optional) {
              val = true;
            } else {
              val = "";
            }
          }
          this.setOptionValueWithSource(name, val, valueSource);
        };
        this.on("option:" + oname, (val) => {
          const invalidValueMessage = `error: option '${option.flags}' argument '${val}' is invalid.`;
          handleOptionValue(val, invalidValueMessage, "cli");
        });
        if (option.envVar) {
          this.on("optionEnv:" + oname, (val) => {
            const invalidValueMessage = `error: option '${option.flags}' value '${val}' from env '${option.envVar}' is invalid.`;
            handleOptionValue(val, invalidValueMessage, "env");
          });
        }
        return this;
      }
      /**
       * Internal implementation shared by .option() and .requiredOption()
       *
       * @return {Command} `this` command for chaining
       * @private
       */
      _optionEx(config, flags, description, fn, defaultValue) {
        if (typeof flags === "object" && flags instanceof Option2) {
          throw new Error(
            "To add an Option object use addOption() instead of option() or requiredOption()"
          );
        }
        const option = this.createOption(flags, description);
        option.makeOptionMandatory(!!config.mandatory);
        if (typeof fn === "function") {
          option.default(defaultValue).argParser(fn);
        } else if (fn instanceof RegExp) {
          const regex = fn;
          fn = (val, def) => {
            const m = regex.exec(val);
            return m ? m[0] : def;
          };
          option.default(defaultValue).argParser(fn);
        } else {
          option.default(fn);
        }
        return this.addOption(option);
      }
      /**
       * Define option with `flags`, `description`, and optional argument parsing function or `defaultValue` or both.
       *
       * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space. A required
       * option-argument is indicated by `<>` and an optional option-argument by `[]`.
       *
       * See the README for more details, and see also addOption() and requiredOption().
       *
       * @example
       * program
       *     .option('-p, --pepper', 'add pepper')
       *     .option('-p, --pizza-type <TYPE>', 'type of pizza') // required option-argument
       *     .option('-c, --cheese [CHEESE]', 'add extra cheese', 'mozzarella') // optional option-argument with default
       *     .option('-t, --tip <VALUE>', 'add tip to purchase cost', parseFloat) // custom parse function
       *
       * @param {string} flags
       * @param {string} [description]
       * @param {(Function|*)} [parseArg] - custom option processing function or default value
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      option(flags, description, parseArg, defaultValue) {
        return this._optionEx({}, flags, description, parseArg, defaultValue);
      }
      /**
       * Add a required option which must have a value after parsing. This usually means
       * the option must be specified on the command line. (Otherwise the same as .option().)
       *
       * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space.
       *
       * @param {string} flags
       * @param {string} [description]
       * @param {(Function|*)} [parseArg] - custom option processing function or default value
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      requiredOption(flags, description, parseArg, defaultValue) {
        return this._optionEx(
          { mandatory: true },
          flags,
          description,
          parseArg,
          defaultValue
        );
      }
      /**
       * Alter parsing of short flags with optional values.
       *
       * @example
       * // for `.option('-f,--flag [value]'):
       * program.combineFlagAndOptionalValue(true);  // `-f80` is treated like `--flag=80`, this is the default behaviour
       * program.combineFlagAndOptionalValue(false) // `-fb` is treated like `-f -b`
       *
       * @param {boolean} [combine] - if `true` or omitted, an optional value can be specified directly after the flag.
       * @return {Command} `this` command for chaining
       */
      combineFlagAndOptionalValue(combine = true) {
        this._combineFlagAndOptionalValue = !!combine;
        return this;
      }
      /**
       * Allow unknown options on the command line.
       *
       * @param {boolean} [allowUnknown] - if `true` or omitted, no error will be thrown for unknown options.
       * @return {Command} `this` command for chaining
       */
      allowUnknownOption(allowUnknown = true) {
        this._allowUnknownOption = !!allowUnknown;
        return this;
      }
      /**
       * Allow excess command-arguments on the command line. Pass false to make excess arguments an error.
       *
       * @param {boolean} [allowExcess] - if `true` or omitted, no error will be thrown for excess arguments.
       * @return {Command} `this` command for chaining
       */
      allowExcessArguments(allowExcess = true) {
        this._allowExcessArguments = !!allowExcess;
        return this;
      }
      /**
       * Enable positional options. Positional means global options are specified before subcommands which lets
       * subcommands reuse the same option names, and also enables subcommands to turn on passThroughOptions.
       * The default behaviour is non-positional and global options may appear anywhere on the command line.
       *
       * @param {boolean} [positional]
       * @return {Command} `this` command for chaining
       */
      enablePositionalOptions(positional = true) {
        this._enablePositionalOptions = !!positional;
        return this;
      }
      /**
       * Pass through options that come after command-arguments rather than treat them as command-options,
       * so actual command-options come before command-arguments. Turning this on for a subcommand requires
       * positional options to have been enabled on the program (parent commands).
       * The default behaviour is non-positional and options may appear before or after command-arguments.
       *
       * @param {boolean} [passThrough] for unknown options.
       * @return {Command} `this` command for chaining
       */
      passThroughOptions(passThrough = true) {
        this._passThroughOptions = !!passThrough;
        this._checkForBrokenPassThrough();
        return this;
      }
      /**
       * @private
       */
      _checkForBrokenPassThrough() {
        if (this.parent && this._passThroughOptions && !this.parent._enablePositionalOptions) {
          throw new Error(
            `passThroughOptions cannot be used for '${this._name}' without turning on enablePositionalOptions for parent command(s)`
          );
        }
      }
      /**
       * Whether to store option values as properties on command object,
       * or store separately (specify false). In both cases the option values can be accessed using .opts().
       *
       * @param {boolean} [storeAsProperties=true]
       * @return {Command} `this` command for chaining
       */
      storeOptionsAsProperties(storeAsProperties = true) {
        if (this.options.length) {
          throw new Error("call .storeOptionsAsProperties() before adding options");
        }
        if (Object.keys(this._optionValues).length) {
          throw new Error(
            "call .storeOptionsAsProperties() before setting option values"
          );
        }
        this._storeOptionsAsProperties = !!storeAsProperties;
        return this;
      }
      /**
       * Retrieve option value.
       *
       * @param {string} key
       * @return {object} value
       */
      getOptionValue(key) {
        if (this._storeOptionsAsProperties) {
          return this[key];
        }
        return this._optionValues[key];
      }
      /**
       * Store option value.
       *
       * @param {string} key
       * @param {object} value
       * @return {Command} `this` command for chaining
       */
      setOptionValue(key, value) {
        return this.setOptionValueWithSource(key, value, void 0);
      }
      /**
       * Store option value and where the value came from.
       *
       * @param {string} key
       * @param {object} value
       * @param {string} source - expected values are default/config/env/cli/implied
       * @return {Command} `this` command for chaining
       */
      setOptionValueWithSource(key, value, source) {
        if (this._storeOptionsAsProperties) {
          this[key] = value;
        } else {
          this._optionValues[key] = value;
        }
        this._optionValueSources[key] = source;
        return this;
      }
      /**
       * Get source of option value.
       * Expected values are default | config | env | cli | implied
       *
       * @param {string} key
       * @return {string}
       */
      getOptionValueSource(key) {
        return this._optionValueSources[key];
      }
      /**
       * Get source of option value. See also .optsWithGlobals().
       * Expected values are default | config | env | cli | implied
       *
       * @param {string} key
       * @return {string}
       */
      getOptionValueSourceWithGlobals(key) {
        let source;
        this._getCommandAndAncestors().forEach((cmd) => {
          if (cmd.getOptionValueSource(key) !== void 0) {
            source = cmd.getOptionValueSource(key);
          }
        });
        return source;
      }
      /**
       * Get user arguments from implied or explicit arguments.
       * Side-effects: set _scriptPath if args included script. Used for default program name, and subcommand searches.
       *
       * @private
       */
      _prepareUserArgs(argv, parseOptions) {
        if (argv !== void 0 && !Array.isArray(argv)) {
          throw new Error("first parameter to parse must be array or undefined");
        }
        parseOptions = parseOptions || {};
        if (argv === void 0 && parseOptions.from === void 0) {
          if (process2.versions?.electron) {
            parseOptions.from = "electron";
          }
          const execArgv = process2.execArgv ?? [];
          if (execArgv.includes("-e") || execArgv.includes("--eval") || execArgv.includes("-p") || execArgv.includes("--print")) {
            parseOptions.from = "eval";
          }
        }
        if (argv === void 0) {
          argv = process2.argv;
        }
        this.rawArgs = argv.slice();
        let userArgs;
        switch (parseOptions.from) {
          case void 0:
          case "node":
            this._scriptPath = argv[1];
            userArgs = argv.slice(2);
            break;
          case "electron":
            if (process2.defaultApp) {
              this._scriptPath = argv[1];
              userArgs = argv.slice(2);
            } else {
              userArgs = argv.slice(1);
            }
            break;
          case "user":
            userArgs = argv.slice(0);
            break;
          case "eval":
            userArgs = argv.slice(1);
            break;
          default:
            throw new Error(
              `unexpected parse option { from: '${parseOptions.from}' }`
            );
        }
        if (!this._name && this._scriptPath)
          this.nameFromFilename(this._scriptPath);
        this._name = this._name || "program";
        return userArgs;
      }
      /**
       * Parse `argv`, setting options and invoking commands when defined.
       *
       * Use parseAsync instead of parse if any of your action handlers are async.
       *
       * Call with no parameters to parse `process.argv`. Detects Electron and special node options like `node --eval`. Easy mode!
       *
       * Or call with an array of strings to parse, and optionally where the user arguments start by specifying where the arguments are `from`:
       * - `'node'`: default, `argv[0]` is the application and `argv[1]` is the script being run, with user arguments after that
       * - `'electron'`: `argv[0]` is the application and `argv[1]` varies depending on whether the electron application is packaged
       * - `'user'`: just user arguments
       *
       * @example
       * program.parse(); // parse process.argv and auto-detect electron and special node flags
       * program.parse(process.argv); // assume argv[0] is app and argv[1] is script
       * program.parse(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
       *
       * @param {string[]} [argv] - optional, defaults to process.argv
       * @param {object} [parseOptions] - optionally specify style of options with from: node/user/electron
       * @param {string} [parseOptions.from] - where the args are from: 'node', 'user', 'electron'
       * @return {Command} `this` command for chaining
       */
      parse(argv, parseOptions) {
        const userArgs = this._prepareUserArgs(argv, parseOptions);
        this._parseCommand([], userArgs);
        return this;
      }
      /**
       * Parse `argv`, setting options and invoking commands when defined.
       *
       * Call with no parameters to parse `process.argv`. Detects Electron and special node options like `node --eval`. Easy mode!
       *
       * Or call with an array of strings to parse, and optionally where the user arguments start by specifying where the arguments are `from`:
       * - `'node'`: default, `argv[0]` is the application and `argv[1]` is the script being run, with user arguments after that
       * - `'electron'`: `argv[0]` is the application and `argv[1]` varies depending on whether the electron application is packaged
       * - `'user'`: just user arguments
       *
       * @example
       * await program.parseAsync(); // parse process.argv and auto-detect electron and special node flags
       * await program.parseAsync(process.argv); // assume argv[0] is app and argv[1] is script
       * await program.parseAsync(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
       *
       * @param {string[]} [argv]
       * @param {object} [parseOptions]
       * @param {string} parseOptions.from - where the args are from: 'node', 'user', 'electron'
       * @return {Promise}
       */
      async parseAsync(argv, parseOptions) {
        const userArgs = this._prepareUserArgs(argv, parseOptions);
        await this._parseCommand([], userArgs);
        return this;
      }
      /**
       * Execute a sub-command executable.
       *
       * @private
       */
      _executeSubCommand(subcommand, args) {
        args = args.slice();
        let launchWithNode = false;
        const sourceExt = [".js", ".ts", ".tsx", ".mjs", ".cjs"];
        function findFile(baseDir, baseName) {
          const localBin = path16.resolve(baseDir, baseName);
          if (fs7.existsSync(localBin))
            return localBin;
          if (sourceExt.includes(path16.extname(baseName)))
            return void 0;
          const foundExt = sourceExt.find(
            (ext) => fs7.existsSync(`${localBin}${ext}`)
          );
          if (foundExt)
            return `${localBin}${foundExt}`;
          return void 0;
        }
        this._checkForMissingMandatoryOptions();
        this._checkForConflictingOptions();
        let executableFile = subcommand._executableFile || `${this._name}-${subcommand._name}`;
        let executableDir = this._executableDir || "";
        if (this._scriptPath) {
          let resolvedScriptPath;
          try {
            resolvedScriptPath = fs7.realpathSync(this._scriptPath);
          } catch (err) {
            resolvedScriptPath = this._scriptPath;
          }
          executableDir = path16.resolve(
            path16.dirname(resolvedScriptPath),
            executableDir
          );
        }
        if (executableDir) {
          let localFile = findFile(executableDir, executableFile);
          if (!localFile && !subcommand._executableFile && this._scriptPath) {
            const legacyName = path16.basename(
              this._scriptPath,
              path16.extname(this._scriptPath)
            );
            if (legacyName !== this._name) {
              localFile = findFile(
                executableDir,
                `${legacyName}-${subcommand._name}`
              );
            }
          }
          executableFile = localFile || executableFile;
        }
        launchWithNode = sourceExt.includes(path16.extname(executableFile));
        let proc;
        if (process2.platform !== "win32") {
          if (launchWithNode) {
            args.unshift(executableFile);
            args = incrementNodeInspectorPort(process2.execArgv).concat(args);
            proc = childProcess.spawn(process2.argv[0], args, { stdio: "inherit" });
          } else {
            proc = childProcess.spawn(executableFile, args, { stdio: "inherit" });
          }
        } else {
          args.unshift(executableFile);
          args = incrementNodeInspectorPort(process2.execArgv).concat(args);
          proc = childProcess.spawn(process2.execPath, args, { stdio: "inherit" });
        }
        if (!proc.killed) {
          const signals = ["SIGUSR1", "SIGUSR2", "SIGTERM", "SIGINT", "SIGHUP"];
          signals.forEach((signal) => {
            process2.on(signal, () => {
              if (proc.killed === false && proc.exitCode === null) {
                proc.kill(signal);
              }
            });
          });
        }
        const exitCallback = this._exitCallback;
        proc.on("close", (code) => {
          code = code ?? 1;
          if (!exitCallback) {
            process2.exit(code);
          } else {
            exitCallback(
              new CommanderError2(
                code,
                "commander.executeSubCommandAsync",
                "(close)"
              )
            );
          }
        });
        proc.on("error", (err) => {
          if (err.code === "ENOENT") {
            const executableDirMessage = executableDir ? `searched for local subcommand relative to directory '${executableDir}'` : "no directory for search for local subcommand, use .executableDir() to supply a custom directory";
            const executableMissing = `'${executableFile}' does not exist
 - if '${subcommand._name}' is not meant to be an executable command, remove description parameter from '.command()' and use '.description()' instead
 - if the default executable name is not suitable, use the executableFile option to supply a custom name or path
 - ${executableDirMessage}`;
            throw new Error(executableMissing);
          } else if (err.code === "EACCES") {
            throw new Error(`'${executableFile}' not executable`);
          }
          if (!exitCallback) {
            process2.exit(1);
          } else {
            const wrappedError = new CommanderError2(
              1,
              "commander.executeSubCommandAsync",
              "(error)"
            );
            wrappedError.nestedError = err;
            exitCallback(wrappedError);
          }
        });
        this.runningCommand = proc;
      }
      /**
       * @private
       */
      _dispatchSubcommand(commandName, operands, unknown) {
        const subCommand = this._findCommand(commandName);
        if (!subCommand)
          this.help({ error: true });
        let promiseChain;
        promiseChain = this._chainOrCallSubCommandHook(
          promiseChain,
          subCommand,
          "preSubcommand"
        );
        promiseChain = this._chainOrCall(promiseChain, () => {
          if (subCommand._executableHandler) {
            this._executeSubCommand(subCommand, operands.concat(unknown));
          } else {
            return subCommand._parseCommand(operands, unknown);
          }
        });
        return promiseChain;
      }
      /**
       * Invoke help directly if possible, or dispatch if necessary.
       * e.g. help foo
       *
       * @private
       */
      _dispatchHelpCommand(subcommandName) {
        if (!subcommandName) {
          this.help();
        }
        const subCommand = this._findCommand(subcommandName);
        if (subCommand && !subCommand._executableHandler) {
          subCommand.help();
        }
        return this._dispatchSubcommand(
          subcommandName,
          [],
          [this._getHelpOption()?.long ?? this._getHelpOption()?.short ?? "--help"]
        );
      }
      /**
       * Check this.args against expected this.registeredArguments.
       *
       * @private
       */
      _checkNumberOfArguments() {
        this.registeredArguments.forEach((arg, i) => {
          if (arg.required && this.args[i] == null) {
            this.missingArgument(arg.name());
          }
        });
        if (this.registeredArguments.length > 0 && this.registeredArguments[this.registeredArguments.length - 1].variadic) {
          return;
        }
        if (this.args.length > this.registeredArguments.length) {
          this._excessArguments(this.args);
        }
      }
      /**
       * Process this.args using this.registeredArguments and save as this.processedArgs!
       *
       * @private
       */
      _processArguments() {
        const myParseArg = (argument, value, previous) => {
          let parsedValue = value;
          if (value !== null && argument.parseArg) {
            const invalidValueMessage = `error: command-argument value '${value}' is invalid for argument '${argument.name()}'.`;
            parsedValue = this._callParseArg(
              argument,
              value,
              previous,
              invalidValueMessage
            );
          }
          return parsedValue;
        };
        this._checkNumberOfArguments();
        const processedArgs = [];
        this.registeredArguments.forEach((declaredArg, index) => {
          let value = declaredArg.defaultValue;
          if (declaredArg.variadic) {
            if (index < this.args.length) {
              value = this.args.slice(index);
              if (declaredArg.parseArg) {
                value = value.reduce((processed, v) => {
                  return myParseArg(declaredArg, v, processed);
                }, declaredArg.defaultValue);
              }
            } else if (value === void 0) {
              value = [];
            }
          } else if (index < this.args.length) {
            value = this.args[index];
            if (declaredArg.parseArg) {
              value = myParseArg(declaredArg, value, declaredArg.defaultValue);
            }
          }
          processedArgs[index] = value;
        });
        this.processedArgs = processedArgs;
      }
      /**
       * Once we have a promise we chain, but call synchronously until then.
       *
       * @param {(Promise|undefined)} promise
       * @param {Function} fn
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCall(promise, fn) {
        if (promise && promise.then && typeof promise.then === "function") {
          return promise.then(() => fn());
        }
        return fn();
      }
      /**
       *
       * @param {(Promise|undefined)} promise
       * @param {string} event
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCallHooks(promise, event) {
        let result = promise;
        const hooks = [];
        this._getCommandAndAncestors().reverse().filter((cmd) => cmd._lifeCycleHooks[event] !== void 0).forEach((hookedCommand) => {
          hookedCommand._lifeCycleHooks[event].forEach((callback) => {
            hooks.push({ hookedCommand, callback });
          });
        });
        if (event === "postAction") {
          hooks.reverse();
        }
        hooks.forEach((hookDetail) => {
          result = this._chainOrCall(result, () => {
            return hookDetail.callback(hookDetail.hookedCommand, this);
          });
        });
        return result;
      }
      /**
       *
       * @param {(Promise|undefined)} promise
       * @param {Command} subCommand
       * @param {string} event
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCallSubCommandHook(promise, subCommand, event) {
        let result = promise;
        if (this._lifeCycleHooks[event] !== void 0) {
          this._lifeCycleHooks[event].forEach((hook) => {
            result = this._chainOrCall(result, () => {
              return hook(this, subCommand);
            });
          });
        }
        return result;
      }
      /**
       * Process arguments in context of this command.
       * Returns action result, in case it is a promise.
       *
       * @private
       */
      _parseCommand(operands, unknown) {
        const parsed = this.parseOptions(unknown);
        this._parseOptionsEnv();
        this._parseOptionsImplied();
        operands = operands.concat(parsed.operands);
        unknown = parsed.unknown;
        this.args = operands.concat(unknown);
        if (operands && this._findCommand(operands[0])) {
          return this._dispatchSubcommand(operands[0], operands.slice(1), unknown);
        }
        if (this._getHelpCommand() && operands[0] === this._getHelpCommand().name()) {
          return this._dispatchHelpCommand(operands[1]);
        }
        if (this._defaultCommandName) {
          this._outputHelpIfRequested(unknown);
          return this._dispatchSubcommand(
            this._defaultCommandName,
            operands,
            unknown
          );
        }
        if (this.commands.length && this.args.length === 0 && !this._actionHandler && !this._defaultCommandName) {
          this.help({ error: true });
        }
        this._outputHelpIfRequested(parsed.unknown);
        this._checkForMissingMandatoryOptions();
        this._checkForConflictingOptions();
        const checkForUnknownOptions = () => {
          if (parsed.unknown.length > 0) {
            this.unknownOption(parsed.unknown[0]);
          }
        };
        const commandEvent = `command:${this.name()}`;
        if (this._actionHandler) {
          checkForUnknownOptions();
          this._processArguments();
          let promiseChain;
          promiseChain = this._chainOrCallHooks(promiseChain, "preAction");
          promiseChain = this._chainOrCall(
            promiseChain,
            () => this._actionHandler(this.processedArgs)
          );
          if (this.parent) {
            promiseChain = this._chainOrCall(promiseChain, () => {
              this.parent.emit(commandEvent, operands, unknown);
            });
          }
          promiseChain = this._chainOrCallHooks(promiseChain, "postAction");
          return promiseChain;
        }
        if (this.parent && this.parent.listenerCount(commandEvent)) {
          checkForUnknownOptions();
          this._processArguments();
          this.parent.emit(commandEvent, operands, unknown);
        } else if (operands.length) {
          if (this._findCommand("*")) {
            return this._dispatchSubcommand("*", operands, unknown);
          }
          if (this.listenerCount("command:*")) {
            this.emit("command:*", operands, unknown);
          } else if (this.commands.length) {
            this.unknownCommand();
          } else {
            checkForUnknownOptions();
            this._processArguments();
          }
        } else if (this.commands.length) {
          checkForUnknownOptions();
          this.help({ error: true });
        } else {
          checkForUnknownOptions();
          this._processArguments();
        }
      }
      /**
       * Find matching command.
       *
       * @private
       * @return {Command | undefined}
       */
      _findCommand(name) {
        if (!name)
          return void 0;
        return this.commands.find(
          (cmd) => cmd._name === name || cmd._aliases.includes(name)
        );
      }
      /**
       * Return an option matching `arg` if any.
       *
       * @param {string} arg
       * @return {Option}
       * @package
       */
      _findOption(arg) {
        return this.options.find((option) => option.is(arg));
      }
      /**
       * Display an error message if a mandatory option does not have a value.
       * Called after checking for help flags in leaf subcommand.
       *
       * @private
       */
      _checkForMissingMandatoryOptions() {
        this._getCommandAndAncestors().forEach((cmd) => {
          cmd.options.forEach((anOption) => {
            if (anOption.mandatory && cmd.getOptionValue(anOption.attributeName()) === void 0) {
              cmd.missingMandatoryOptionValue(anOption);
            }
          });
        });
      }
      /**
       * Display an error message if conflicting options are used together in this.
       *
       * @private
       */
      _checkForConflictingLocalOptions() {
        const definedNonDefaultOptions = this.options.filter((option) => {
          const optionKey = option.attributeName();
          if (this.getOptionValue(optionKey) === void 0) {
            return false;
          }
          return this.getOptionValueSource(optionKey) !== "default";
        });
        const optionsWithConflicting = definedNonDefaultOptions.filter(
          (option) => option.conflictsWith.length > 0
        );
        optionsWithConflicting.forEach((option) => {
          const conflictingAndDefined = definedNonDefaultOptions.find(
            (defined) => option.conflictsWith.includes(defined.attributeName())
          );
          if (conflictingAndDefined) {
            this._conflictingOption(option, conflictingAndDefined);
          }
        });
      }
      /**
       * Display an error message if conflicting options are used together.
       * Called after checking for help flags in leaf subcommand.
       *
       * @private
       */
      _checkForConflictingOptions() {
        this._getCommandAndAncestors().forEach((cmd) => {
          cmd._checkForConflictingLocalOptions();
        });
      }
      /**
       * Parse options from `argv` removing known options,
       * and return argv split into operands and unknown arguments.
       *
       * Examples:
       *
       *     argv => operands, unknown
       *     --known kkk op => [op], []
       *     op --known kkk => [op], []
       *     sub --unknown uuu op => [sub], [--unknown uuu op]
       *     sub -- --unknown uuu op => [sub --unknown uuu op], []
       *
       * @param {string[]} argv
       * @return {{operands: string[], unknown: string[]}}
       */
      parseOptions(argv) {
        const operands = [];
        const unknown = [];
        let dest = operands;
        const args = argv.slice();
        function maybeOption(arg) {
          return arg.length > 1 && arg[0] === "-";
        }
        let activeVariadicOption = null;
        while (args.length) {
          const arg = args.shift();
          if (arg === "--") {
            if (dest === unknown)
              dest.push(arg);
            dest.push(...args);
            break;
          }
          if (activeVariadicOption && !maybeOption(arg)) {
            this.emit(`option:${activeVariadicOption.name()}`, arg);
            continue;
          }
          activeVariadicOption = null;
          if (maybeOption(arg)) {
            const option = this._findOption(arg);
            if (option) {
              if (option.required) {
                const value = args.shift();
                if (value === void 0)
                  this.optionMissingArgument(option);
                this.emit(`option:${option.name()}`, value);
              } else if (option.optional) {
                let value = null;
                if (args.length > 0 && !maybeOption(args[0])) {
                  value = args.shift();
                }
                this.emit(`option:${option.name()}`, value);
              } else {
                this.emit(`option:${option.name()}`);
              }
              activeVariadicOption = option.variadic ? option : null;
              continue;
            }
          }
          if (arg.length > 2 && arg[0] === "-" && arg[1] !== "-") {
            const option = this._findOption(`-${arg[1]}`);
            if (option) {
              if (option.required || option.optional && this._combineFlagAndOptionalValue) {
                this.emit(`option:${option.name()}`, arg.slice(2));
              } else {
                this.emit(`option:${option.name()}`);
                args.unshift(`-${arg.slice(2)}`);
              }
              continue;
            }
          }
          if (/^--[^=]+=/.test(arg)) {
            const index = arg.indexOf("=");
            const option = this._findOption(arg.slice(0, index));
            if (option && (option.required || option.optional)) {
              this.emit(`option:${option.name()}`, arg.slice(index + 1));
              continue;
            }
          }
          if (maybeOption(arg)) {
            dest = unknown;
          }
          if ((this._enablePositionalOptions || this._passThroughOptions) && operands.length === 0 && unknown.length === 0) {
            if (this._findCommand(arg)) {
              operands.push(arg);
              if (args.length > 0)
                unknown.push(...args);
              break;
            } else if (this._getHelpCommand() && arg === this._getHelpCommand().name()) {
              operands.push(arg);
              if (args.length > 0)
                operands.push(...args);
              break;
            } else if (this._defaultCommandName) {
              unknown.push(arg);
              if (args.length > 0)
                unknown.push(...args);
              break;
            }
          }
          if (this._passThroughOptions) {
            dest.push(arg);
            if (args.length > 0)
              dest.push(...args);
            break;
          }
          dest.push(arg);
        }
        return { operands, unknown };
      }
      /**
       * Return an object containing local option values as key-value pairs.
       *
       * @return {object}
       */
      opts() {
        if (this._storeOptionsAsProperties) {
          const result = {};
          const len = this.options.length;
          for (let i = 0; i < len; i++) {
            const key = this.options[i].attributeName();
            result[key] = key === this._versionOptionName ? this._version : this[key];
          }
          return result;
        }
        return this._optionValues;
      }
      /**
       * Return an object containing merged local and global option values as key-value pairs.
       *
       * @return {object}
       */
      optsWithGlobals() {
        return this._getCommandAndAncestors().reduce(
          (combinedOptions, cmd) => Object.assign(combinedOptions, cmd.opts()),
          {}
        );
      }
      /**
       * Display error message and exit (or call exitOverride).
       *
       * @param {string} message
       * @param {object} [errorOptions]
       * @param {string} [errorOptions.code] - an id string representing the error
       * @param {number} [errorOptions.exitCode] - used with process.exit
       */
      error(message, errorOptions) {
        this._outputConfiguration.outputError(
          `${message}
`,
          this._outputConfiguration.writeErr
        );
        if (typeof this._showHelpAfterError === "string") {
          this._outputConfiguration.writeErr(`${this._showHelpAfterError}
`);
        } else if (this._showHelpAfterError) {
          this._outputConfiguration.writeErr("\n");
          this.outputHelp({ error: true });
        }
        const config = errorOptions || {};
        const exitCode = config.exitCode || 1;
        const code = config.code || "commander.error";
        this._exit(exitCode, code, message);
      }
      /**
       * Apply any option related environment variables, if option does
       * not have a value from cli or client code.
       *
       * @private
       */
      _parseOptionsEnv() {
        this.options.forEach((option) => {
          if (option.envVar && option.envVar in process2.env) {
            const optionKey = option.attributeName();
            if (this.getOptionValue(optionKey) === void 0 || ["default", "config", "env"].includes(
              this.getOptionValueSource(optionKey)
            )) {
              if (option.required || option.optional) {
                this.emit(`optionEnv:${option.name()}`, process2.env[option.envVar]);
              } else {
                this.emit(`optionEnv:${option.name()}`);
              }
            }
          }
        });
      }
      /**
       * Apply any implied option values, if option is undefined or default value.
       *
       * @private
       */
      _parseOptionsImplied() {
        const dualHelper = new DualOptions(this.options);
        const hasCustomOptionValue = (optionKey) => {
          return this.getOptionValue(optionKey) !== void 0 && !["default", "implied"].includes(this.getOptionValueSource(optionKey));
        };
        this.options.filter(
          (option) => option.implied !== void 0 && hasCustomOptionValue(option.attributeName()) && dualHelper.valueFromOption(
            this.getOptionValue(option.attributeName()),
            option
          )
        ).forEach((option) => {
          Object.keys(option.implied).filter((impliedKey) => !hasCustomOptionValue(impliedKey)).forEach((impliedKey) => {
            this.setOptionValueWithSource(
              impliedKey,
              option.implied[impliedKey],
              "implied"
            );
          });
        });
      }
      /**
       * Argument `name` is missing.
       *
       * @param {string} name
       * @private
       */
      missingArgument(name) {
        const message = `error: missing required argument '${name}'`;
        this.error(message, { code: "commander.missingArgument" });
      }
      /**
       * `Option` is missing an argument.
       *
       * @param {Option} option
       * @private
       */
      optionMissingArgument(option) {
        const message = `error: option '${option.flags}' argument missing`;
        this.error(message, { code: "commander.optionMissingArgument" });
      }
      /**
       * `Option` does not have a value, and is a mandatory option.
       *
       * @param {Option} option
       * @private
       */
      missingMandatoryOptionValue(option) {
        const message = `error: required option '${option.flags}' not specified`;
        this.error(message, { code: "commander.missingMandatoryOptionValue" });
      }
      /**
       * `Option` conflicts with another option.
       *
       * @param {Option} option
       * @param {Option} conflictingOption
       * @private
       */
      _conflictingOption(option, conflictingOption) {
        const findBestOptionFromValue = (option2) => {
          const optionKey = option2.attributeName();
          const optionValue = this.getOptionValue(optionKey);
          const negativeOption = this.options.find(
            (target) => target.negate && optionKey === target.attributeName()
          );
          const positiveOption = this.options.find(
            (target) => !target.negate && optionKey === target.attributeName()
          );
          if (negativeOption && (negativeOption.presetArg === void 0 && optionValue === false || negativeOption.presetArg !== void 0 && optionValue === negativeOption.presetArg)) {
            return negativeOption;
          }
          return positiveOption || option2;
        };
        const getErrorMessage = (option2) => {
          const bestOption = findBestOptionFromValue(option2);
          const optionKey = bestOption.attributeName();
          const source = this.getOptionValueSource(optionKey);
          if (source === "env") {
            return `environment variable '${bestOption.envVar}'`;
          }
          return `option '${bestOption.flags}'`;
        };
        const message = `error: ${getErrorMessage(option)} cannot be used with ${getErrorMessage(conflictingOption)}`;
        this.error(message, { code: "commander.conflictingOption" });
      }
      /**
       * Unknown option `flag`.
       *
       * @param {string} flag
       * @private
       */
      unknownOption(flag) {
        if (this._allowUnknownOption)
          return;
        let suggestion = "";
        if (flag.startsWith("--") && this._showSuggestionAfterError) {
          let candidateFlags = [];
          let command = this;
          do {
            const moreFlags = command.createHelp().visibleOptions(command).filter((option) => option.long).map((option) => option.long);
            candidateFlags = candidateFlags.concat(moreFlags);
            command = command.parent;
          } while (command && !command._enablePositionalOptions);
          suggestion = suggestSimilar(flag, candidateFlags);
        }
        const message = `error: unknown option '${flag}'${suggestion}`;
        this.error(message, { code: "commander.unknownOption" });
      }
      /**
       * Excess arguments, more than expected.
       *
       * @param {string[]} receivedArgs
       * @private
       */
      _excessArguments(receivedArgs) {
        if (this._allowExcessArguments)
          return;
        const expected = this.registeredArguments.length;
        const s = expected === 1 ? "" : "s";
        const forSubcommand = this.parent ? ` for '${this.name()}'` : "";
        const message = `error: too many arguments${forSubcommand}. Expected ${expected} argument${s} but got ${receivedArgs.length}.`;
        this.error(message, { code: "commander.excessArguments" });
      }
      /**
       * Unknown command.
       *
       * @private
       */
      unknownCommand() {
        const unknownName = this.args[0];
        let suggestion = "";
        if (this._showSuggestionAfterError) {
          const candidateNames = [];
          this.createHelp().visibleCommands(this).forEach((command) => {
            candidateNames.push(command.name());
            if (command.alias())
              candidateNames.push(command.alias());
          });
          suggestion = suggestSimilar(unknownName, candidateNames);
        }
        const message = `error: unknown command '${unknownName}'${suggestion}`;
        this.error(message, { code: "commander.unknownCommand" });
      }
      /**
       * Get or set the program version.
       *
       * This method auto-registers the "-V, --version" option which will print the version number.
       *
       * You can optionally supply the flags and description to override the defaults.
       *
       * @param {string} [str]
       * @param {string} [flags]
       * @param {string} [description]
       * @return {(this | string | undefined)} `this` command for chaining, or version string if no arguments
       */
      version(str, flags, description) {
        if (str === void 0)
          return this._version;
        this._version = str;
        flags = flags || "-V, --version";
        description = description || "output the version number";
        const versionOption = this.createOption(flags, description);
        this._versionOptionName = versionOption.attributeName();
        this._registerOption(versionOption);
        this.on("option:" + versionOption.name(), () => {
          this._outputConfiguration.writeOut(`${str}
`);
          this._exit(0, "commander.version", str);
        });
        return this;
      }
      /**
       * Set the description.
       *
       * @param {string} [str]
       * @param {object} [argsDescription]
       * @return {(string|Command)}
       */
      description(str, argsDescription) {
        if (str === void 0 && argsDescription === void 0)
          return this._description;
        this._description = str;
        if (argsDescription) {
          this._argsDescription = argsDescription;
        }
        return this;
      }
      /**
       * Set the summary. Used when listed as subcommand of parent.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      summary(str) {
        if (str === void 0)
          return this._summary;
        this._summary = str;
        return this;
      }
      /**
       * Set an alias for the command.
       *
       * You may call more than once to add multiple aliases. Only the first alias is shown in the auto-generated help.
       *
       * @param {string} [alias]
       * @return {(string|Command)}
       */
      alias(alias) {
        if (alias === void 0)
          return this._aliases[0];
        let command = this;
        if (this.commands.length !== 0 && this.commands[this.commands.length - 1]._executableHandler) {
          command = this.commands[this.commands.length - 1];
        }
        if (alias === command._name)
          throw new Error("Command alias can't be the same as its name");
        const matchingCommand = this.parent?._findCommand(alias);
        if (matchingCommand) {
          const existingCmd = [matchingCommand.name()].concat(matchingCommand.aliases()).join("|");
          throw new Error(
            `cannot add alias '${alias}' to command '${this.name()}' as already have command '${existingCmd}'`
          );
        }
        command._aliases.push(alias);
        return this;
      }
      /**
       * Set aliases for the command.
       *
       * Only the first alias is shown in the auto-generated help.
       *
       * @param {string[]} [aliases]
       * @return {(string[]|Command)}
       */
      aliases(aliases) {
        if (aliases === void 0)
          return this._aliases;
        aliases.forEach((alias) => this.alias(alias));
        return this;
      }
      /**
       * Set / get the command usage `str`.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      usage(str) {
        if (str === void 0) {
          if (this._usage)
            return this._usage;
          const args = this.registeredArguments.map((arg) => {
            return humanReadableArgName(arg);
          });
          return [].concat(
            this.options.length || this._helpOption !== null ? "[options]" : [],
            this.commands.length ? "[command]" : [],
            this.registeredArguments.length ? args : []
          ).join(" ");
        }
        this._usage = str;
        return this;
      }
      /**
       * Get or set the name of the command.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      name(str) {
        if (str === void 0)
          return this._name;
        this._name = str;
        return this;
      }
      /**
       * Set the name of the command from script filename, such as process.argv[1],
       * or require.main.filename, or __filename.
       *
       * (Used internally and public although not documented in README.)
       *
       * @example
       * program.nameFromFilename(require.main.filename);
       *
       * @param {string} filename
       * @return {Command}
       */
      nameFromFilename(filename) {
        this._name = path16.basename(filename, path16.extname(filename));
        return this;
      }
      /**
       * Get or set the directory for searching for executable subcommands of this command.
       *
       * @example
       * program.executableDir(__dirname);
       * // or
       * program.executableDir('subcommands');
       *
       * @param {string} [path]
       * @return {(string|null|Command)}
       */
      executableDir(path17) {
        if (path17 === void 0)
          return this._executableDir;
        this._executableDir = path17;
        return this;
      }
      /**
       * Return program help documentation.
       *
       * @param {{ error: boolean }} [contextOptions] - pass {error:true} to wrap for stderr instead of stdout
       * @return {string}
       */
      helpInformation(contextOptions) {
        const helper = this.createHelp();
        if (helper.helpWidth === void 0) {
          helper.helpWidth = contextOptions && contextOptions.error ? this._outputConfiguration.getErrHelpWidth() : this._outputConfiguration.getOutHelpWidth();
        }
        return helper.formatHelp(this, helper);
      }
      /**
       * @private
       */
      _getHelpContext(contextOptions) {
        contextOptions = contextOptions || {};
        const context = { error: !!contextOptions.error };
        let write;
        if (context.error) {
          write = (arg) => this._outputConfiguration.writeErr(arg);
        } else {
          write = (arg) => this._outputConfiguration.writeOut(arg);
        }
        context.write = contextOptions.write || write;
        context.command = this;
        return context;
      }
      /**
       * Output help information for this command.
       *
       * Outputs built-in help, and custom text added using `.addHelpText()`.
       *
       * @param {{ error: boolean } | Function} [contextOptions] - pass {error:true} to write to stderr instead of stdout
       */
      outputHelp(contextOptions) {
        let deprecatedCallback;
        if (typeof contextOptions === "function") {
          deprecatedCallback = contextOptions;
          contextOptions = void 0;
        }
        const context = this._getHelpContext(contextOptions);
        this._getCommandAndAncestors().reverse().forEach((command) => command.emit("beforeAllHelp", context));
        this.emit("beforeHelp", context);
        let helpInformation = this.helpInformation(context);
        if (deprecatedCallback) {
          helpInformation = deprecatedCallback(helpInformation);
          if (typeof helpInformation !== "string" && !Buffer.isBuffer(helpInformation)) {
            throw new Error("outputHelp callback must return a string or a Buffer");
          }
        }
        context.write(helpInformation);
        if (this._getHelpOption()?.long) {
          this.emit(this._getHelpOption().long);
        }
        this.emit("afterHelp", context);
        this._getCommandAndAncestors().forEach(
          (command) => command.emit("afterAllHelp", context)
        );
      }
      /**
       * You can pass in flags and a description to customise the built-in help option.
       * Pass in false to disable the built-in help option.
       *
       * @example
       * program.helpOption('-?, --help' 'show help'); // customise
       * program.helpOption(false); // disable
       *
       * @param {(string | boolean)} flags
       * @param {string} [description]
       * @return {Command} `this` command for chaining
       */
      helpOption(flags, description) {
        if (typeof flags === "boolean") {
          if (flags) {
            this._helpOption = this._helpOption ?? void 0;
          } else {
            this._helpOption = null;
          }
          return this;
        }
        flags = flags ?? "-h, --help";
        description = description ?? "display help for command";
        this._helpOption = this.createOption(flags, description);
        return this;
      }
      /**
       * Lazy create help option.
       * Returns null if has been disabled with .helpOption(false).
       *
       * @returns {(Option | null)} the help option
       * @package
       */
      _getHelpOption() {
        if (this._helpOption === void 0) {
          this.helpOption(void 0, void 0);
        }
        return this._helpOption;
      }
      /**
       * Supply your own option to use for the built-in help option.
       * This is an alternative to using helpOption() to customise the flags and description etc.
       *
       * @param {Option} option
       * @return {Command} `this` command for chaining
       */
      addHelpOption(option) {
        this._helpOption = option;
        return this;
      }
      /**
       * Output help information and exit.
       *
       * Outputs built-in help, and custom text added using `.addHelpText()`.
       *
       * @param {{ error: boolean }} [contextOptions] - pass {error:true} to write to stderr instead of stdout
       */
      help(contextOptions) {
        this.outputHelp(contextOptions);
        let exitCode = process2.exitCode || 0;
        if (exitCode === 0 && contextOptions && typeof contextOptions !== "function" && contextOptions.error) {
          exitCode = 1;
        }
        this._exit(exitCode, "commander.help", "(outputHelp)");
      }
      /**
       * Add additional text to be displayed with the built-in help.
       *
       * Position is 'before' or 'after' to affect just this command,
       * and 'beforeAll' or 'afterAll' to affect this command and all its subcommands.
       *
       * @param {string} position - before or after built-in help
       * @param {(string | Function)} text - string to add, or a function returning a string
       * @return {Command} `this` command for chaining
       */
      addHelpText(position, text) {
        const allowedValues = ["beforeAll", "before", "after", "afterAll"];
        if (!allowedValues.includes(position)) {
          throw new Error(`Unexpected value for position to addHelpText.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        const helpEvent = `${position}Help`;
        this.on(helpEvent, (context) => {
          let helpStr;
          if (typeof text === "function") {
            helpStr = text({ error: context.error, command: context.command });
          } else {
            helpStr = text;
          }
          if (helpStr) {
            context.write(`${helpStr}
`);
          }
        });
        return this;
      }
      /**
       * Output help information if help flags specified
       *
       * @param {Array} args - array of options to search for help flags
       * @private
       */
      _outputHelpIfRequested(args) {
        const helpOption = this._getHelpOption();
        const helpRequested = helpOption && args.find((arg) => helpOption.is(arg));
        if (helpRequested) {
          this.outputHelp();
          this._exit(0, "commander.helpDisplayed", "(outputHelp)");
        }
      }
    };
    function incrementNodeInspectorPort(args) {
      return args.map((arg) => {
        if (!arg.startsWith("--inspect")) {
          return arg;
        }
        let debugOption;
        let debugHost = "127.0.0.1";
        let debugPort = "9229";
        let match;
        if ((match = arg.match(/^(--inspect(-brk)?)$/)) !== null) {
          debugOption = match[1];
        } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+)$/)) !== null) {
          debugOption = match[1];
          if (/^\d+$/.test(match[3])) {
            debugPort = match[3];
          } else {
            debugHost = match[3];
          }
        } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+):(\d+)$/)) !== null) {
          debugOption = match[1];
          debugHost = match[3];
          debugPort = match[4];
        }
        if (debugOption && debugPort !== "0") {
          return `${debugOption}=${debugHost}:${parseInt(debugPort) + 1}`;
        }
        return arg;
      });
    }
    exports.Command = Command2;
  }
});

// node_modules/commander/index.js
var require_commander = __commonJS({
  "node_modules/commander/index.js"(exports) {
    var { Argument: Argument2 } = require_argument();
    var { Command: Command2 } = require_command();
    var { CommanderError: CommanderError2, InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var { Help: Help2 } = require_help();
    var { Option: Option2 } = require_option();
    exports.program = new Command2();
    exports.createCommand = (name) => new Command2(name);
    exports.createOption = (flags, description) => new Option2(flags, description);
    exports.createArgument = (name, description) => new Argument2(name, description);
    exports.Command = Command2;
    exports.Option = Option2;
    exports.Argument = Argument2;
    exports.Help = Help2;
    exports.CommanderError = CommanderError2;
    exports.InvalidArgumentError = InvalidArgumentError2;
    exports.InvalidOptionArgumentError = InvalidArgumentError2;
  }
});

// src/sanitize.ts
if (process.env.CLAUDECODE) {
  delete process.env.CLAUDECODE;
}

// node_modules/commander/esm.mjs
var import_index = __toESM(require_commander(), 1);
var {
  program,
  createCommand,
  createArgument,
  createOption,
  CommanderError,
  InvalidArgumentError,
  InvalidOptionArgumentError,
  // deprecated old name
  Command,
  Argument,
  Option,
  Help
} = import_index.default;

// lib/project.mjs
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, readFile, readdir, stat, writeFile, copyFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
function getHomeDir(explicit) {
  return path.resolve(explicit ?? os.homedir()).replace(/[\\\/]+$/, "");
}
function resolveProjectRoot(projectRoot) {
  const start = path.resolve(projectRoot ?? process.cwd());
  const gitRoot = spawnSync("git", ["-C", start, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
  if (gitRoot.status === 0) {
    const value = gitRoot.stdout.trim();
    if (value) {
      return path.resolve(value);
    }
  }
  return start;
}
function getProjectHash(projectPath) {
  const normalized = path.resolve(projectPath).replace(/[\\\/]+$/, "").toLowerCase();
  return createHash("sha256").update(normalized).digest("hex").slice(0, 8);
}
function detectGit(projectRoot) {
  const isGit = spawnSync("git", ["-C", projectRoot, "rev-parse", "--is-inside-work-tree"], { encoding: "utf8" });
  if (isGit.status !== 0) {
    return { isGitRepo: false, gitBranch: null };
  }
  const branch = spawnSync("git", ["-C", projectRoot, "rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" });
  return { isGitRepo: true, gitBranch: branch.status === 0 ? branch.stdout.trim() || null : null };
}
async function fileExists(filePath) {
  try {
    const info = await stat(filePath);
    return info.isFile() || info.isDirectory();
  } catch {
    return false;
  }
}
async function detectLanguage(projectRoot) {
  const score = {
    "node-typescript": 0,
    python: 0,
    go: 0,
    rust: 0,
    dotnet: 0
  };
  const signals = [];
  const checks = [
    { rel: "package.json", language: "node-typescript", points: 4 },
    { rel: "tsconfig.json", language: "node-typescript", points: 3 },
    { rel: "pnpm-lock.yaml", language: "node-typescript", points: 2 },
    { rel: "yarn.lock", language: "node-typescript", points: 2 },
    { rel: "pyproject.toml", language: "python", points: 4 },
    { rel: "requirements.txt", language: "python", points: 3 },
    { rel: "setup.py", language: "python", points: 2 },
    { rel: "go.mod", language: "go", points: 5 },
    { rel: "Cargo.toml", language: "rust", points: 5 }
  ];
  for (const check of checks) {
    if (await fileExists(path.join(projectRoot, check.rel))) {
      score[check.language] += check.points;
      signals.push(check.rel);
    }
  }
  const dotnetFiles = await readdir(projectRoot).catch(() => []);
  if (dotnetFiles.some((item) => item.endsWith(".sln"))) {
    score.dotnet += 4;
    signals.push("*.sln");
  }
  let winner = "other";
  let winnerScore = 0;
  for (const [language, points] of Object.entries(score)) {
    if (points > winnerScore) {
      winner = language;
      winnerScore = points;
    }
  }
  const confidence = winnerScore >= 5 ? "high" : winnerScore >= 3 ? "medium" : "low";
  return { language: winner, confidence, signals };
}
async function getPackageScripts(projectRoot) {
  const packagePath = path.join(projectRoot, "package.json");
  if (!await fileExists(packagePath)) {
    return {};
  }
  try {
    const raw = await readFile(packagePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed.scripts ?? {};
  } catch {
    return {};
  }
}
async function buildValidationPresets(language, projectRoot) {
  if (language === "node-typescript") {
    const scripts = await getPackageScripts(projectRoot);
    const test = scripts.test ? "npm test" : "npx vitest run";
    const typecheck = scripts.typecheck ? "npm run typecheck" : await fileExists(path.join(projectRoot, "tsconfig.json")) ? "npx tsc --noEmit" : null;
    const lint = scripts.lint ? "npm run lint" : "npx eslint .";
    const build = scripts.build ? "npm run build" : null;
    const testsAndTypes = [typecheck, test].filter((value) => Boolean(value));
    const full = [typecheck, lint, test, build].filter((value) => Boolean(value));
    return { tests_only: [test], tests_and_types: testsAndTypes, full };
  }
  if (language === "python") {
    return { tests_only: ["pytest"], tests_and_types: ["mypy .", "pytest"], full: ["mypy .", "ruff check .", "pytest"] };
  }
  if (language === "go") {
    return { tests_only: ["go test ./..."], tests_and_types: ["go vet ./...", "go test ./..."], full: ["go vet ./...", "golangci-lint run", "go test ./..."] };
  }
  if (language === "rust") {
    return { tests_only: ["cargo test"], tests_and_types: ["cargo clippy -- -D warnings", "cargo test"], full: ["cargo clippy -- -D warnings", "cargo test", "cargo build --release"] };
  }
  if (language === "dotnet") {
    return { tests_only: ["dotnet test"], tests_and_types: ["dotnet build", "dotnet test"], full: ["dotnet build", "dotnet test"] };
  }
  return { tests_only: [], tests_and_types: [], full: [] };
}
async function discoverSpecCandidates(projectRoot) {
  const ordered = ["SPEC.md", "README.md", "docs/SPEC.md", "docs/spec.md", "requirements.md", "PRD.md", "specs", "docs"];
  const found = [];
  for (const rel of ordered) {
    if (await fileExists(path.join(projectRoot, rel))) {
      found.push(rel.replace(/\\/g, "/"));
    }
  }
  return found;
}
var WORKSTREAM_CATEGORIES = {
  frontend: "frontend",
  backend: "backend",
  infrastructure: "infrastructure",
  infra: "infrastructure",
  api: "api",
  ui: "ui",
  database: "database",
  db: "database",
  auth: "auth",
  authentication: "auth",
  deployment: "deployment",
  devops: "devops",
  mobile: "mobile",
  web: "web",
  cli: "cli",
  sdk: "sdk",
  library: "library",
  service: "service",
  microservice: "service",
  integration: "integration"
};
var WORKSTREAM_MATCHERS = Object.entries(WORKSTREAM_CATEGORIES).map(([keyword, category]) => ({
  category,
  regex: new RegExp(`\\b${keyword}\\b`, "i")
}));
async function analyzeSpecComplexity(projectRoot, specCandidates) {
  const parallelismKeywords = [
    "parallel",
    "concurrent",
    "simultaneous",
    "independent",
    "separate",
    "decoupled",
    "async",
    "asynchronous",
    "fan-out",
    "fanout",
    "multi-track",
    "workstream",
    "workstreams"
  ];
  const discoveredWorkstreams = /* @__PURE__ */ new Set();
  let fallbackWorkstreamFiles = 0;
  let totalParallelismSignals = 0;
  let totalEstimatedIssues = 0;
  let analyzedFiles = 0;
  for (const specFile of specCandidates) {
    const specPath = path.join(projectRoot, specFile);
    if (!existsSync(specPath))
      continue;
    try {
      const content = await readFile(specPath, "utf8");
      const lowered = content.toLowerCase();
      analyzedFiles++;
      const headerLines = content.split(/\r?\n/).filter((line) => /^#{2,3}\s/.test(line));
      const uniqueFileCategories = /* @__PURE__ */ new Set();
      for (const header of headerLines) {
        for (const matcher of WORKSTREAM_MATCHERS) {
          if (matcher.regex.test(header)) {
            uniqueFileCategories.add(matcher.category);
          }
        }
      }
      for (const category of uniqueFileCategories) {
        discoveredWorkstreams.add(category);
      }
      if (uniqueFileCategories.size === 0 && headerLines.length > 0) {
        fallbackWorkstreamFiles += 1;
      }
      for (const kw of parallelismKeywords) {
        const regex = new RegExp(`\\b${kw}\\b`, "gi");
        const matches = lowered.match(regex);
        if (matches)
          totalParallelismSignals += matches.length;
      }
      const taskHeaders = headerLines.length;
      const acceptanceCriteria = (content.match(/acceptance criteria/gi) || []).length;
      const checkboxItems = (content.match(/^\s*-\s+\[[ x]\]/gim) || []).length;
      totalEstimatedIssues += Math.max(taskHeaders, acceptanceCriteria > 0 ? acceptanceCriteria + checkboxItems : checkboxItems, taskHeaders > 0 ? taskHeaders : 1);
    } catch {
    }
  }
  const workstreamCount = discoveredWorkstreams.size > 0 ? discoveredWorkstreams.size : fallbackWorkstreamFiles > 0 ? fallbackWorkstreamFiles : 1;
  const parallelismScore = totalParallelismSignals;
  const estimatedIssueCount = totalEstimatedIssues > 0 ? totalEstimatedIssues : 1;
  return {
    workstream_count: workstreamCount,
    parallelism_score: parallelismScore,
    estimated_issue_count: estimatedIssueCount,
    analyzed_files: analyzedFiles
  };
}
async function detectCIWorkflowSupport(projectRoot) {
  const workflowsDir = path.join(projectRoot, ".github", "workflows");
  let hasWorkflows = false;
  let workflowCount = 0;
  const workflowTypes = [];
  try {
    if (existsSync(workflowsDir)) {
      const entries = await readdir(workflowsDir);
      const yamlFiles = entries.filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
      workflowCount = yamlFiles.length;
      hasWorkflows = workflowCount > 0;
      for (const file of yamlFiles) {
        try {
          const content = await readFile(path.join(workflowsDir, file), "utf8");
          const lowered = content.toLowerCase();
          const hasExplicitTestJob = /^\s{2,}(test|tests|check|checks)\s*:\s*$/gim.test(content);
          const hasTestCommand = /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\b/i.test(content) || /\b(?:pytest|go test|cargo test|dotnet test|ctest)\b/i.test(content);
          const hasTestKeyword = /\btests?\b/i.test(content) || /\btesting\b/i.test(content);
          if (hasExplicitTestJob || hasTestCommand || hasTestKeyword) {
            workflowTypes.push("test");
          }
          if (lowered.includes("lint") || lowered.includes("eslint") || lowered.includes("ruff")) {
            workflowTypes.push("lint");
          }
          if (lowered.includes("build") || lowered.includes("compile")) {
            workflowTypes.push("build");
          }
          if (lowered.includes("deploy") || lowered.includes("release")) {
            workflowTypes.push("deploy");
          }
        } catch {
        }
      }
    }
  } catch {
  }
  return {
    has_workflows: hasWorkflows,
    workflow_count: workflowCount,
    workflow_types: [...new Set(workflowTypes)]
  };
}
function recommendMode(complexity, ciSupport) {
  const reasoning = [];
  let orchestratorScore = 0;
  if (complexity.workstream_count >= 3) {
    orchestratorScore += 2;
    reasoning.push(`${complexity.workstream_count} distinct workstreams detected \u2014 parallelism would help`);
  } else if (complexity.workstream_count >= 2) {
    orchestratorScore += 1;
    reasoning.push(`${complexity.workstream_count} workstreams found \u2014 moderate parallelism potential`);
  } else {
    reasoning.push("Single workstream \u2014 loop mode is sufficient");
  }
  if (complexity.parallelism_score >= 3) {
    orchestratorScore += 2;
    reasoning.push(`Strong parallelism signals (${complexity.parallelism_score} mentions)`);
  } else if (complexity.parallelism_score >= 1) {
    orchestratorScore += 1;
    reasoning.push(`Some parallelism signals (${complexity.parallelism_score} mentions)`);
  }
  if (complexity.estimated_issue_count >= 10) {
    orchestratorScore += 2;
    reasoning.push(`Large scope (${complexity.estimated_issue_count} estimated issues) \u2014 orchestrator helps manage complexity`);
  } else if (complexity.estimated_issue_count >= 5) {
    orchestratorScore += 1;
    reasoning.push(`Medium scope (${complexity.estimated_issue_count} estimated issues)`);
  } else {
    reasoning.push(`Small scope (${complexity.estimated_issue_count} estimated issues) \u2014 loop mode is efficient`);
  }
  if (ciSupport.has_workflows && ciSupport.workflow_types.includes("test")) {
    orchestratorScore += 1;
    reasoning.push("CI test workflows detected \u2014 orchestrator can leverage automated gates");
  }
  const recommendedMode = orchestratorScore >= 3 ? "orchestrate" : "loop";
  if (recommendedMode === "orchestrate") {
    reasoning.unshift("Recommendation: orchestrator mode (score: " + orchestratorScore + "/7)");
  } else {
    reasoning.unshift("Recommendation: loop mode (score: " + orchestratorScore + "/7)");
  }
  return { recommended_mode: recommendedMode, reasoning };
}
async function discoverReferenceCandidates(projectRoot, specCandidates) {
  const ordered = [
    "SPEC.md",
    "README.md",
    "RESEARCH.md",
    "REVIEW_LOG.md",
    "AGENTS.md",
    "CONTRIBUTING.md",
    "docs/architecture.md",
    "docs/design.md",
    "docs/adr"
  ];
  const excluded = new Set(specCandidates);
  const found = [];
  for (const rel of ordered) {
    const normalized = rel.replace(/\\/g, "/");
    if (excluded.has(normalized)) {
      continue;
    }
    if (await fileExists(path.join(projectRoot, rel))) {
      found.push(normalized);
    }
  }
  return found;
}
function normalizeList(items) {
  if (!items) {
    return [];
  }
  if (typeof items === "string") {
    return items.split(",").map((item) => item.trim()).filter((item) => item.length > 0);
  }
  return items.flatMap((item) => typeof item === "string" ? item.split(",") : [item]).map((item) => typeof item === "string" ? item.trim() : item).filter((item) => typeof item === "string" && item.length > 0);
}
function readDefaultProvider(homeDir) {
  const configPath = path.join(homeDir, ".aloop", "config.yml");
  if (!existsSync(configPath)) {
    return "claude";
  }
  try {
    const content = readFileSync(configPath, "utf8");
    const line = content.split(/\r?\n/).find((entry) => entry.trim().startsWith("default_provider:"));
    return line?.split(":").slice(1).join(":").trim() || "claude";
  } catch {
    return "claude";
  }
}
var KNOWN_PROVIDERS = ["claude", "codex", "gemini", "copilot", "opencode"];
function validateProviders(providerList) {
  const unknown = providerList.filter((p) => !KNOWN_PROVIDERS.includes(p));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown provider(s): ${unknown.join(", ")} (valid: ${KNOWN_PROVIDERS.join(", ")})`
    );
  }
}
function validateSpecFiles(specFiles, projectRoot) {
  for (const file of specFiles) {
    if (!existsSync(path.resolve(projectRoot, file))) {
      throw new Error(`Spec file not found: ${file}`);
    }
  }
}
function getInstalledProviders() {
  const providers = ["claude", "opencode", "codex", "gemini", "copilot"];
  const installed = [];
  const missing = [];
  for (const provider of providers) {
    const status = spawnSync(provider, ["--version"], { stdio: "ignore" });
    if (status.status === 0 || status.status === 1) {
      installed.push(provider);
    } else {
      missing.push(provider);
    }
  }
  return { installed, missing };
}
function assertProjectConfigured(discovery) {
  if (!discovery?.setup?.config_exists) {
    throw new Error("No Aloop configuration found for this project. Run `aloop setup` first.");
  }
}
async function detectDevcontainer(projectRoot) {
  const candidates = [
    path.join(projectRoot, ".devcontainer", "devcontainer.json"),
    path.join(projectRoot, ".devcontainer.json")
  ];
  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return { enabled: true, config_path: candidate };
    }
  }
  return { enabled: false, config_path: null };
}
async function discoverWorkspace(options = {}) {
  const homeDir = getHomeDir(options.homeDir);
  const projectRoot = resolveProjectRoot(options.projectRoot);
  const projectHash = getProjectHash(projectRoot);
  const projectName = path.basename(projectRoot);
  const { isGitRepo, gitBranch } = detectGit(projectRoot);
  const language = await detectLanguage(projectRoot);
  const validationPresets = await buildValidationPresets(language.language, projectRoot);
  const specCandidates = await discoverSpecCandidates(projectRoot);
  const referenceCandidates = await discoverReferenceCandidates(projectRoot, specCandidates);
  const providers = getInstalledProviders();
  const projectDir = path.join(homeDir, ".aloop", "projects", projectHash);
  const complexity = await analyzeSpecComplexity(projectRoot, specCandidates);
  const ciSupport = await detectCIWorkflowSupport(projectRoot);
  const modeRecommendation = recommendMode(complexity, ciSupport);
  const devcontainer = await detectDevcontainer(projectRoot);
  return {
    project: {
      root: projectRoot,
      name: projectName,
      hash: projectHash,
      is_git_repo: isGitRepo,
      git_branch: gitBranch
    },
    setup: {
      project_dir: projectDir,
      config_path: path.join(projectDir, "config.yml"),
      config_exists: existsSync(path.join(projectDir, "config.yml")),
      templates_dir: path.join(homeDir, ".aloop", "templates")
    },
    context: {
      detected_language: language.language,
      language_confidence: language.confidence,
      language_signals: language.signals,
      validation_presets: validationPresets,
      spec_candidates: specCandidates,
      reference_candidates: referenceCandidates,
      context_files: {
        "TODO.md": existsSync(path.join(projectRoot, "TODO.md")),
        "RESEARCH.md": existsSync(path.join(projectRoot, "RESEARCH.md")),
        "REVIEW_LOG.md": existsSync(path.join(projectRoot, "REVIEW_LOG.md")),
        "STEERING.md": existsSync(path.join(projectRoot, "STEERING.md"))
      }
    },
    providers: {
      installed: providers.installed,
      missing: providers.missing,
      default_provider: readDefaultProvider(homeDir),
      default_models: {
        claude: "opus",
        opencode: "opencode-default",
        codex: "gpt-5.3-codex",
        gemini: "gemini-3.1-pro-preview",
        copilot: "gpt-5.3-codex"
      },
      round_robin_default: ["claude", "opencode", "codex", "gemini", "copilot"]
    },
    devcontainer,
    spec_complexity: complexity,
    ci_support: ciSupport,
    mode_recommendation: modeRecommendation,
    discovered_at: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function toYamlQuoted(value) {
  if (value === null || value === void 0)
    return "''";
  return `'${String(value).replace(/'/g, "''")}'`;
}
var AUTONOMY_LEVELS = /* @__PURE__ */ new Set(["cautious", "balanced", "autonomous"]);
function normalizeAutonomyLevel(value) {
  if (typeof value !== "string") {
    return "balanced";
  }
  const normalized = value.trim().toLowerCase();
  return AUTONOMY_LEVELS.has(normalized) ? normalized : "balanced";
}
var DATA_PRIVACY_LEVELS = /* @__PURE__ */ new Set(["private", "public"]);
function normalizeDataPrivacy(value) {
  if (typeof value !== "string") {
    return "private";
  }
  const normalized = value.trim().toLowerCase();
  return DATA_PRIVACY_LEVELS.has(normalized) ? normalized : "private";
}
function templatesExist(directory, requiredTemplates) {
  return existsSync(directory) && requiredTemplates.every((file) => existsSync(path.join(directory, file)));
}
function resolveBundledTemplatesDir(requiredTemplates, options = {}) {
  const moduleDir = path.resolve(options.moduleDir ?? path.dirname(fileURLToPath(import.meta.url)));
  const argv1 = options.argv1 ?? process.argv[1];
  const argvDir = typeof argv1 === "string" && argv1.length > 0 ? path.dirname(path.resolve(argv1)) : null;
  const cwdDir = path.resolve(options.cwd ?? process.cwd());
  const baseDirs = [moduleDir, argvDir, cwdDir].filter(Boolean);
  const seen = /* @__PURE__ */ new Set();
  for (const baseDir of baseDirs) {
    for (let depth = 0; depth <= 6; depth++) {
      const up = depth === 0 ? [] : new Array(depth).fill("..");
      const candidate = path.resolve(baseDir, ...up, "templates");
      if (seen.has(candidate))
        continue;
      seen.add(candidate);
      if (templatesExist(candidate, requiredTemplates)) {
        return candidate;
      }
    }
  }
  return null;
}
var OPENCODE_AGENT_FILES = ["vision-reviewer.md", "error-analyst.md", "code-critic.md"];
var LOOP_SCRIPT_FILES = ["loop.sh", "loop.ps1"];
function resolveBundledAgentsDir(options = {}) {
  const moduleDir = path.resolve(options.moduleDir ?? path.dirname(fileURLToPath(import.meta.url)));
  const argv1 = options.argv1 ?? process.argv[1];
  const argvDir = typeof argv1 === "string" && argv1.length > 0 ? path.dirname(path.resolve(argv1)) : null;
  const cwdDir = path.resolve(options.cwd ?? process.cwd());
  const baseDirs = [moduleDir, argvDir, cwdDir].filter(Boolean);
  const seen = /* @__PURE__ */ new Set();
  for (const baseDir of baseDirs) {
    for (let depth = 0; depth <= 6; depth++) {
      const up = depth === 0 ? [] : new Array(depth).fill("..");
      const candidate = path.resolve(baseDir, ...up, "agents", "opencode");
      if (seen.has(candidate))
        continue;
      seen.add(candidate);
      if (agentsExist(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}
function agentsExist(dir) {
  return OPENCODE_AGENT_FILES.every((f) => existsSync(path.join(dir, f)));
}
function loopScriptsExist(dir) {
  return LOOP_SCRIPT_FILES.every((f) => existsSync(path.join(dir, f)));
}
function resolveBundledBinDir(options = {}) {
  const moduleDir = path.resolve(options.moduleDir ?? path.dirname(fileURLToPath(import.meta.url)));
  const argv1 = options.argv1 ?? process.argv[1];
  const argvDir = typeof argv1 === "string" && argv1.length > 0 ? path.dirname(path.resolve(argv1)) : null;
  const cwdDir = path.resolve(options.cwd ?? process.cwd());
  const baseDirs = [moduleDir, argvDir, cwdDir].filter(Boolean);
  const candidateSuffixes = [["bin"], ["aloop", "bin"]];
  const seen = /* @__PURE__ */ new Set();
  for (const baseDir of baseDirs) {
    for (let depth = 0; depth <= 6; depth++) {
      const up = depth === 0 ? [] : new Array(depth).fill("..");
      for (const suffix of candidateSuffixes) {
        const candidate = path.resolve(baseDir, ...up, ...suffix);
        if (seen.has(candidate))
          continue;
        seen.add(candidate);
        if (loopScriptsExist(candidate)) {
          return candidate;
        }
      }
    }
  }
  return null;
}
function resolveProviderHints(provider) {
  if (provider === "claude")
    return "- Claude hint: Use parallel subagents when large searches are needed; summarize before coding.";
  if (provider === "codex")
    return "- Codex hint: Prefer stdin prompt mode and keep outputs concise and action-focused.";
  if (provider === "gemini")
    return "- Gemini hint: Keep prompts explicit and deterministic; re-check assumptions before writing code.";
  if (provider === "copilot")
    return "- Copilot hint: Keep edits surgical and validate with focused checks after changes.";
  if (provider === "round-robin")
    return "- Round-robin hint: Keep context handoff explicit in TODO.md and REVIEW_LOG.md between providers.";
  return "";
}
var LOOP_PROMPT_TEMPLATES = ["PROMPT_plan.md", "PROMPT_build.md", "PROMPT_review.md", "PROMPT_steer.md", "PROMPT_proof.md", "PROMPT_qa.md"];
var ORCHESTRATOR_PROMPT_TEMPLATES = [
  "PROMPT_orch_scan.md",
  "PROMPT_orch_product_analyst.md",
  "PROMPT_orch_arch_analyst.md",
  "PROMPT_orch_decompose.md",
  "PROMPT_orch_refine.md",
  "PROMPT_orch_sub_decompose.md",
  "PROMPT_orch_planner_frontend.md",
  "PROMPT_orch_planner_backend.md",
  "PROMPT_orch_planner_infra.md",
  "PROMPT_orch_planner_fullstack.md",
  "PROMPT_orch_estimate.md",
  "PROMPT_orch_resolver.md",
  "PROMPT_orch_replan.md",
  "PROMPT_orch_spec_consistency.md"
];
function resolvePromptTemplates(mode) {
  return mode === "orchestrate" ? ORCHESTRATOR_PROMPT_TEMPLATES : LOOP_PROMPT_TEMPLATES;
}
function normalizeScaffoldMode(mode) {
  if (typeof mode !== "string") {
    return "plan-build-review";
  }
  const trimmed = mode.trim();
  if (trimmed.length === 0) {
    return "plan-build-review";
  }
  const lowered = trimmed.toLowerCase();
  if (lowered === "loop") {
    return "plan-build-review";
  }
  if (lowered === "orchestrate") {
    return "orchestrate";
  }
  return trimmed;
}
var INCLUDE_DIRECTIVE_PATTERN = /\{\{include:([^}]+)\}\}/g;
async function expandTemplateIncludes(content, templatesDir, seenIncludes = []) {
  const directives = [...content.matchAll(INCLUDE_DIRECTIVE_PATTERN)];
  if (directives.length === 0) {
    return content;
  }
  let expanded = content;
  for (const directive of directives) {
    const rawPath = directive[1].trim();
    const includePath = path.resolve(templatesDir, rawPath);
    const relativePath = path.relative(templatesDir, includePath);
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      throw new Error(`Include path escapes templates directory: ${rawPath}`);
    }
    if (seenIncludes.includes(includePath)) {
      const cycle = [...seenIncludes, includePath].map((entry) => path.relative(templatesDir, entry)).join(" -> ");
      throw new Error(`Circular include detected: ${cycle}`);
    }
    if (!existsSync(includePath)) {
      throw new Error(`Included template not found: ${includePath}`);
    }
    const includeContent = await readFile(includePath, "utf8");
    const nested = await expandTemplateIncludes(includeContent, templatesDir, [...seenIncludes, includePath]);
    expanded = expanded.replace(directive[0], nested);
  }
  return expanded;
}
async function scaffoldWorkspace(options = {}) {
  const discovery = await discoverWorkspace(options);
  const provider = options.provider ?? discovery.providers.default_provider;
  const enabledProviders = normalizeList(options.enabledProviders);
  const enabled = enabledProviders.length > 0 ? enabledProviders : discovery.providers.installed.length > 0 ? discovery.providers.installed : ["claude"];
  const roundRobinOrder = normalizeList(options.roundRobinOrder);
  const roundRobin = roundRobinOrder.length > 0 ? roundRobinOrder : [...enabled];
  const specFiles = normalizeList(options.specFiles);
  const resolvedSpecFiles = specFiles.length > 0 ? specFiles : discovery.context.spec_candidates.slice(0, 1);
  const referenceFiles = normalizeList(options.referenceFiles);
  const resolvedReferenceFiles = referenceFiles.length > 0 ? referenceFiles : discovery.context.reference_candidates;
  const validationCommands = normalizeList(options.validationCommands);
  const resolvedValidation = validationCommands.length > 0 ? validationCommands : discovery.context.validation_presets.full;
  const safetyRules = normalizeList(options.safetyRules);
  const resolvedSafetyRules = safetyRules.length > 0 ? safetyRules : ["Never delete the project directory or run destructive commands", "Never push to remote without explicit user approval"];
  const language = options.language ?? discovery.context.detected_language;
  const mode = normalizeScaffoldMode(options.mode);
  const autonomyLevel = normalizeAutonomyLevel(options.autonomyLevel);
  const dataPrivacy = normalizeDataPrivacy(options.dataPrivacy);
  const devcontainerAuthStrategy = options.devcontainerAuthStrategy ?? "mount-first";
  const templatesDir = path.resolve(options.templatesDir ?? discovery.setup.templates_dir);
  const promptsDir = path.join(discovery.setup.project_dir, "prompts");
  if (enabledProviders.length > 0) {
    validateProviders(enabled);
  }
  if (options.provider) {
    validateProviders([provider]);
  }
  if (specFiles.length > 0) {
    validateSpecFiles(specFiles, discovery.project.root);
  }
  const requiredTemplates = resolvePromptTemplates(mode);
  const templatesMissing = requiredTemplates.some((f) => !existsSync(path.join(templatesDir, f)));
  if (templatesMissing && !options.templatesDir) {
    const bundledTemplatesDir = resolveBundledTemplatesDir(requiredTemplates);
    if (bundledTemplatesDir) {
      await mkdir(templatesDir, { recursive: true });
      const entries = await readdir(bundledTemplatesDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile()) {
          await copyFile(path.join(bundledTemplatesDir, entry.name), path.join(templatesDir, entry.name));
        } else if (entry.isDirectory()) {
          const subSrc = path.join(bundledTemplatesDir, entry.name);
          const subDest = path.join(templatesDir, entry.name);
          await mkdir(subDest, { recursive: true });
          const subEntries = await readdir(subSrc);
          for (const subFile of subEntries) {
            const subStat = await stat(path.join(subSrc, subFile));
            if (subStat.isFile()) {
              await copyFile(path.join(subSrc, subFile), path.join(subDest, subFile));
            }
          }
        }
      }
    }
  }
  const loopBinDir = path.join(discovery.setup.templates_dir, "..", "bin");
  const loopScriptsMissing = LOOP_SCRIPT_FILES.some((file) => !existsSync(path.join(loopBinDir, file)));
  if (loopScriptsMissing) {
    const bundledBinDir = options.bundledBinDir ?? resolveBundledBinDir();
    if (bundledBinDir) {
      await mkdir(loopBinDir, { recursive: true });
      for (const scriptName of LOOP_SCRIPT_FILES) {
        const destination = path.join(loopBinDir, scriptName);
        if (existsSync(destination))
          continue;
        const source = path.join(bundledBinDir, scriptName);
        if (!existsSync(source))
          continue;
        await copyFile(source, destination);
      }
      const loopShellPath = path.join(loopBinDir, "loop.sh");
      if (existsSync(loopShellPath)) {
        await chmod(loopShellPath, 493);
      }
    }
  }
  for (const file of requiredTemplates) {
    if (!existsSync(path.join(templatesDir, file))) {
      throw new Error(`Template not found: ${path.join(templatesDir, file)}`);
    }
  }
  await mkdir(promptsDir, { recursive: true });
  const configLines = [
    `project_name: ${toYamlQuoted(discovery.project.name)}`,
    `project_root: ${toYamlQuoted(discovery.project.root)}`,
    `language: ${toYamlQuoted(language)}`,
    `provider: ${toYamlQuoted(provider)}`,
    `mode: ${toYamlQuoted(mode)}`,
    `autonomy_level: ${toYamlQuoted(autonomyLevel)}`,
    `data_privacy: ${toYamlQuoted(dataPrivacy)}`,
    `devcontainer_auth_strategy: ${toYamlQuoted(devcontainerAuthStrategy)}`,
    "spec_files:",
    ...resolvedSpecFiles.map((value) => `  - ${toYamlQuoted(value)}`),
    "reference_files:",
    ...resolvedReferenceFiles.map((value) => `  - ${toYamlQuoted(value)}`),
    "validation_commands: |",
    ...resolvedValidation.map((value) => `  ${value}`),
    "safety_rules: |",
    ...resolvedSafetyRules.map((value) => `  - ${value}`),
    "",
    "enabled_providers:",
    ...enabled.map((value) => `  - ${toYamlQuoted(value)}`),
    "",
    "models:",
    "  claude: 'opus'",
    "  opencode: 'opencode-default'",
    "  codex: 'gpt-5.3-codex'",
    "  gemini: 'gemini-3.1-pro-preview'",
    "  copilot: 'gpt-5.3-codex'",
    "",
    "round_robin_order:",
    ...roundRobin.map((value) => `  - ${toYamlQuoted(value)}`),
    "",
    "privacy_policy:",
    `  data_classification: ${toYamlQuoted(dataPrivacy)}`,
    `  zdr_enabled: ${dataPrivacy === "private" ? "true" : "false"}`,
    `  require_data_retention_safe: ${dataPrivacy === "private" ? "true" : "false"}`,
    "",
    `created_at: ${toYamlQuoted((/* @__PURE__ */ new Date()).toISOString())}`
  ];
  await writeFile(discovery.setup.config_path, `${configLines.join("\n")}
`, "utf8");
  const replacements = {
    "{{SPEC_FILES}}": resolvedSpecFiles.join(", "),
    "{{REFERENCE_FILES}}": resolvedReferenceFiles.join(", "),
    "{{VALIDATION_COMMANDS}}": resolvedValidation.map((value) => `- ${value}`).join("\n"),
    "{{SAFETY_RULES}}": resolvedSafetyRules.map((value) => `- ${value}`).join("\n"),
    "{{PROVIDER_HINTS}}": resolveProviderHints(provider)
  };
  for (const fileName of requiredTemplates) {
    const templatePath = path.join(templatesDir, fileName);
    const destinationPath = path.join(promptsDir, fileName);
    let content = await readFile(templatePath, "utf8");
    content = await expandTemplateIncludes(content, templatesDir);
    for (const [key, value] of Object.entries(replacements)) {
      content = content.replaceAll(key, value);
    }
    await writeFile(destinationPath, content, "utf8");
  }
  if (enabled.includes("opencode")) {
    const projectRoot = discovery.project.root;
    const opencodeAgentsDir = path.join(projectRoot, ".opencode", "agents");
    const bundledAgentsDir = resolveBundledAgentsDir();
    if (bundledAgentsDir) {
      await mkdir(opencodeAgentsDir, { recursive: true });
      for (const agentFile of OPENCODE_AGENT_FILES) {
        const src = path.join(bundledAgentsDir, agentFile);
        const dest = path.join(opencodeAgentsDir, agentFile);
        if (existsSync(src)) {
          await copyFile(src, dest);
        }
      }
    }
  }
  return {
    config_path: discovery.setup.config_path,
    prompts_dir: promptsDir,
    project_dir: discovery.setup.project_dir,
    project_hash: discovery.project.hash
  };
}

// src/commands/project.ts
var discoverWorkspace2 = discoverWorkspace;
var scaffoldWorkspace2 = scaffoldWorkspace;
var assertProjectConfigured2 = assertProjectConfigured;
var resolveProjectRoot2 = resolveProjectRoot;
var getProjectHash2 = getProjectHash;

// src/commands/resolve.ts
async function resolveCommand(options = {}) {
  const discovery = await discoverWorkspace2({ projectRoot: options.projectRoot, homeDir: options.homeDir });
  assertProjectConfigured2(discovery);
  const result = {
    project: discovery.project,
    setup: discovery.setup
  };
  if (options.output === "text") {
    console.log(`Project: ${result.project.name} [${result.project.hash}]`);
    console.log(`Root: ${result.project.root}`);
    console.log(`Project config: ${result.setup.config_path}`);
    return;
  }
  console.log(JSON.stringify(result, null, 2));
}

// src/commands/discover.ts
async function discoverCommand(options = {}) {
  const result = await discoverWorkspace2({ projectRoot: options.projectRoot, homeDir: options.homeDir });
  if (options.output === "text") {
    console.log(`Project: ${result.project.name} [${result.project.hash}]`);
    console.log(`Root: ${result.project.root}`);
    console.log(`Detected language: ${result.context.detected_language} (${result.context.language_confidence})`);
    console.log(`Providers installed: ${result.providers.installed.join(", ")}`);
    console.log(`Spec candidates: ${result.context.spec_candidates.join(", ")}`);
    console.log(`Reference candidates: ${result.context.reference_candidates.join(", ")}`);
    return;
  }
  console.log(JSON.stringify(result, null, 2));
}

// src/commands/scaffold.ts
async function scaffoldCommand(options = {}) {
  const result = await scaffoldWorkspace2({
    projectRoot: options.projectRoot,
    homeDir: options.homeDir,
    language: options.language,
    provider: options.provider,
    autonomyLevel: options.autonomyLevel,
    enabledProviders: options.enabledProviders,
    roundRobinOrder: options.roundRobinOrder,
    specFiles: options.specFiles,
    referenceFiles: options.referenceFiles,
    validationCommands: options.validationCommands,
    safetyRules: options.safetyRules,
    mode: options.mode,
    templatesDir: options.templatesDir
  });
  if (options.output === "text") {
    console.log(`Wrote config: ${result.config_path}`);
    console.log(`Wrote prompts: ${result.prompts_dir}`);
    return;
  }
  console.log(JSON.stringify(result, null, 2));
}

// src/commands/dashboard.ts
import { createServer } from "node:http";
import { watch } from "node:fs";
import { promises as fs4 } from "node:fs";
import { spawn, spawnSync as spawnSync3 } from "node:child_process";
import os2 from "node:os";
import path6 from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// src/lib/requests.ts
import * as fs2 from "node:fs/promises";
import { existsSync as existsSync3 } from "node:fs";
import * as path4 from "node:path";
import { spawnSync as spawnSync2 } from "node:child_process";

// src/lib/plan.ts
import * as fs from "node:fs/promises";
import { existsSync as existsSync2 } from "node:fs";
import * as path2 from "node:path";
async function readLoopPlan(sessionDir) {
  const planPath = path2.join(sessionDir, "loop-plan.json");
  if (!existsSync2(planPath))
    return null;
  try {
    const content = await fs.readFile(planPath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    console.error(`Failed to read loop-plan.json at ${planPath}:`, error);
    return null;
  }
}
async function writeLoopPlan(sessionDir, plan) {
  const planPath = path2.join(sessionDir, "loop-plan.json");
  await fs.writeFile(planPath, JSON.stringify(plan, null, 2) + "\n", "utf8");
}
async function mutateLoopPlan(sessionDir, options) {
  const plan = await readLoopPlan(sessionDir);
  if (!plan) {
    throw new Error(`loop-plan.json not found in ${sessionDir}`);
  }
  if (options.cycle !== void 0)
    plan.cycle = options.cycle;
  if (options.cyclePosition !== void 0)
    plan.cyclePosition = options.cyclePosition;
  if (options.iteration !== void 0)
    plan.iteration = options.iteration;
  if (options.allTasksMarkedDone !== void 0)
    plan.allTasksMarkedDone = options.allTasksMarkedDone;
  plan.version = (plan.version || 1) + 1;
  await writeLoopPlan(sessionDir, plan);
  return plan;
}
async function writeQueueOverride(sessionDir, name, content, frontmatter) {
  const queueDir = path2.join(sessionDir, "queue");
  await fs.mkdir(queueDir, { recursive: true });
  const timestamp = (/* @__PURE__ */ new Date()).getTime();
  const fileName = `${timestamp}-${name}.md`;
  const queuePath = path2.join(queueDir, fileName);
  let finalContent = content;
  if (frontmatter) {
    const fmLines = ["---"];
    for (const [key, value] of Object.entries(frontmatter)) {
      fmLines.push(`${key}: ${value}`);
    }
    fmLines.push("---");
    finalContent = `${fmLines.join("\n")}

${content}`;
  }
  await fs.writeFile(queuePath, finalContent, "utf8");
  return queuePath;
}
async function queueSteeringPrompt(sessionDir, promptsDir, steeringInstruction, name = "steering", frontmatter = { agent: "steer", type: "steering_override" }) {
  const steerTemplatePath = path2.join(promptsDir, "PROMPT_steer.md");
  let steerPromptContent = steeringInstruction;
  if (existsSync2(steerTemplatePath)) {
    const templateContent = await fs.readFile(steerTemplatePath, "utf8");
    steerPromptContent = templateContent + "\n\n" + steeringInstruction;
  }
  return await writeQueueOverride(sessionDir, name, steerPromptContent, frontmatter);
}

// src/lib/specBackfill.ts
import * as path3 from "node:path";
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
async function writeSpecBackfill(opts) {
  const { specFile, section, content, sessionId, iteration, projectRoot, deps } = opts;
  const specPath = path3.resolve(projectRoot, specFile);
  try {
    const existingContent = await deps.readFile(specPath, "utf8");
    const sectionPattern = new RegExp(`^#{1,6}\\s+${escapeRegex(section)}.*$`, "m");
    const match = existingContent.match(sectionPattern);
    let updatedContent;
    if (match && match.index !== void 0) {
      const lines = existingContent.split("\n");
      const startIdx = lines.findIndex((l) => l.match(sectionPattern));
      let endIdx = lines.findIndex((l, i) => i > startIdx && /^#{1,6}\s+/.test(l));
      if (endIdx === -1)
        endIdx = lines.length;
      lines.splice(startIdx + 1, endIdx - startIdx - 1, "", content, "");
      updatedContent = lines.join("\n");
    } else {
      updatedContent = existingContent + "\n\n## " + section + "\n\n" + content + "\n";
    }
    await deps.writeFile(specPath, updatedContent, "utf8");
    if (deps.execGit) {
      await deps.execGit(["add", specFile], projectRoot);
      const commitMsg = [
        `docs: backfill spec section "${section}"`,
        "",
        `Aloop-Agent: spec-backfill`,
        `Aloop-Iteration: ${iteration}`,
        `Aloop-Session: ${sessionId}`
      ].join("\n");
      await deps.execGit(["commit", "-m", commitMsg, "--allow-empty"], projectRoot);
    }
    return true;
  } catch {
    return false;
  }
}

// src/lib/requests.ts
async function processAgentRequests(options) {
  const requestsDir = path4.join(options.aloopDir, "requests");
  if (!existsSync3(requestsDir))
    return;
  const entries = await fs2.readdir(requestsDir, { withFileTypes: true });
  const requestFiles = entries.filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".json")).map((e) => e.name).sort();
  if (requestFiles.length === 0)
    return;
  const processedDir = path4.join(requestsDir, "processed");
  const failedDir = path4.join(requestsDir, "failed");
  await fs2.mkdir(processedDir, { recursive: true });
  await fs2.mkdir(failedDir, { recursive: true });
  const processedEntries = await fs2.readdir(processedDir);
  const reservedArchivePaths = new Set(processedEntries.map((e) => path4.join(processedDir, e).toLowerCase()));
  for (const fileName of requestFiles) {
    const requestPath = path4.join(requestsDir, fileName);
    let request;
    try {
      const content = await fs2.readFile(requestPath, "utf8");
      request = JSON.parse(content);
    } catch (e) {
      const archivePath = getArchivePath(failedDir, fileName, /* @__PURE__ */ new Set());
      await fs2.rename(requestPath, archivePath);
      await writeSessionLogEntry(options.logPath, "gh_request_failed", {
        type: "unknown",
        id: "unknown",
        request_file: fileName,
        error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`
      });
      continue;
    }
    try {
      await handleRequest(request, fileName, options);
      const archivePath = getArchivePath(processedDir, fileName, reservedArchivePaths);
      await fs2.rename(requestPath, archivePath);
      await writeSessionLogEntry(options.logPath, "gh_request_processed", {
        type: request.type,
        id: request.id,
        request_file: fileName
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const archivePath = getArchivePath(failedDir, fileName, /* @__PURE__ */ new Set());
      await fs2.rename(requestPath, archivePath);
      await writeFailureToQueue(request, errorMsg, options, fileName);
      await writeSessionLogEntry(options.logPath, "gh_request_failed", {
        type: request.type,
        id: request.id,
        request_file: fileName,
        error: errorMsg
      });
    }
  }
}
function getArchivePath(processedDir, fileName, existingFiles) {
  let destination = path4.join(processedDir, fileName);
  if (!existingFiles.has(destination.toLowerCase())) {
    existingFiles.add(destination.toLowerCase());
    return destination;
  }
  const ext = path4.extname(fileName);
  const base = path4.basename(fileName, ext);
  let suffix = 1;
  while (true) {
    const candidate = path4.join(processedDir, `${base}.dup${suffix}${ext}`);
    if (!existingFiles.has(candidate.toLowerCase())) {
      existingFiles.add(candidate.toLowerCase());
      return candidate;
    }
    suffix += 1;
  }
}
async function writeSessionLogEntry(logPath, event, data) {
  const payload = {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    event,
    ...data
  };
  await fs2.appendFile(logPath, `${JSON.stringify(payload)}
`, "utf8");
}
async function handleRequest(request, fileName, options) {
  switch (request.type) {
    case "create_issues":
      return handleCreateIssues(request, fileName, options);
    case "update_issue":
      return handleUpdateIssue(request, fileName, options);
    case "close_issue":
      return handleCloseIssue(request, fileName, options);
    case "create_pr":
      return handleCreatePr(request, fileName, options);
    case "merge_pr":
      return handleMergePr(request, fileName, options);
    case "dispatch_child":
      return handleDispatchChild(request, fileName, options);
    case "steer_child":
      return handleSteerChild(request, fileName, options);
    case "stop_child":
      return handleStopChild(request, fileName, options);
    case "post_comment":
      return handlePostComment(request, fileName, options);
    case "query_issues":
      return handleQueryIssues(request, fileName, options);
    case "spec_backfill":
      return handleSpecBackfill(request, fileName, options);
    default:
      throw new Error(`Unsupported request type: ${request.type}`);
  }
}
async function handleCreateIssues(request, fileName, options) {
  const results = [];
  for (const issueReq of request.payload.issues) {
    const tempRequestPath = path4.join(options.aloopDir, "requests", `_tmp_${request.id}_${results.length}.json`);
    await fs2.writeFile(tempRequestPath, JSON.stringify({
      type: "issue-create",
      title: issueReq.title,
      body: await fs2.readFile(path4.join(options.workdir, issueReq.body_file), "utf8"),
      labels: [...issueReq.labels || [], "aloop"]
    }));
    const result = await options.ghCommandRunner("issue-create", options.sessionId, tempRequestPath);
    await fs2.unlink(tempRequestPath);
    if (result.exitCode !== 0) {
      throw new Error(`issue-create failed: ${result.output}`);
    }
    results.push(JSON.parse(result.output));
  }
  await writeSuccessToQueue(request, { issues: results }, options, fileName);
}
async function handleUpdateIssue(request, fileName, options) {
  const args = ["issue", "edit", String(request.payload.number)];
  if (request.payload.body_file) {
    const body = await fs2.readFile(path4.join(options.workdir, request.payload.body_file), "utf8");
    const tempBodyPath = path4.join(options.aloopDir, "requests", `_tmp_body_${request.id}.md`);
    await fs2.writeFile(tempBodyPath, body);
    args.push("--body-file", tempBodyPath);
    const spawn3 = options.spawnSync || spawnSync2;
    try {
      const result = spawn3("gh", args, { encoding: "utf8" });
      if (result.status !== 0)
        throw new Error(result.stderr);
    } finally {
      await fs2.unlink(tempBodyPath);
    }
  } else {
    if (request.payload.state)
      args.push("--state", request.payload.state);
    if (request.payload.labels_add) {
      for (const l of request.payload.labels_add)
        args.push("--add-label", l);
    }
    if (request.payload.labels_remove) {
      for (const l of request.payload.labels_remove)
        args.push("--remove-label", l);
    }
    const spawn3 = options.spawnSync || spawnSync2;
    const result = spawn3("gh", args, { encoding: "utf8" });
    if (result.status !== 0)
      throw new Error(result.stderr);
  }
  await writeSuccessToQueue(request, { status: "updated" }, options, fileName);
}
async function handleCloseIssue(request, fileName, options) {
  const tempRequestPath = path4.join(options.aloopDir, "requests", `_tmp_${request.id}.json`);
  await fs2.writeFile(tempRequestPath, JSON.stringify({
    type: "issue-close",
    issue_number: request.payload.number,
    target_labels: ["aloop"]
    // Policy check requires this
  }));
  const result = await options.ghCommandRunner("issue-close", options.sessionId, tempRequestPath);
  await fs2.unlink(tempRequestPath);
  if (result.exitCode !== 0)
    throw new Error(result.output);
  await writeSuccessToQueue(request, { status: "closed" }, options, fileName);
}
async function handleCreatePr(request, fileName, options) {
  const tempRequestPath = path4.join(options.aloopDir, "requests", `_tmp_${request.id}.json`);
  await fs2.writeFile(tempRequestPath, JSON.stringify({
    type: "pr-create",
    head: request.payload.head,
    base: request.payload.base || "agent/trunk",
    title: request.payload.title,
    body: await fs2.readFile(path4.join(options.workdir, request.payload.body_file), "utf8")
  }));
  const result = await options.ghCommandRunner("pr-create", options.sessionId, tempRequestPath);
  await fs2.unlink(tempRequestPath);
  if (result.exitCode !== 0)
    throw new Error(result.output);
  await writeSuccessToQueue(request, JSON.parse(result.output), options, fileName);
}
async function handleMergePr(request, fileName, options) {
  const tempRequestPath = path4.join(options.aloopDir, "requests", `_tmp_${request.id}.json`);
  await fs2.writeFile(tempRequestPath, JSON.stringify({
    type: "pr-merge",
    pr_number: request.payload.number
  }));
  const result = await options.ghCommandRunner("pr-merge", options.sessionId, tempRequestPath);
  await fs2.unlink(tempRequestPath);
  if (result.exitCode !== 0)
    throw new Error(result.output);
  await writeSuccessToQueue(request, { status: "merged" }, options, fileName);
}
async function handleDispatchChild(request, fileName, options) {
  const args = [
    "gh",
    "start",
    "--issue",
    String(request.payload.issue_number),
    "--home-dir",
    path4.dirname(options.aloopDir),
    "--project-root",
    options.workdir,
    "--output",
    "json"
  ];
  const spawn3 = options.spawnSync || spawnSync2;
  const result = spawn3("aloop", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Failed to dispatch child: ${result.stderr || result.stdout}`);
  }
  const output = JSON.parse(result.stdout);
  await writeSuccessToQueue(request, output, options, fileName);
}
async function handleSteerChild(request, fileName, options) {
  const activePath = path4.join(options.aloopDir, "active.json");
  if (!existsSync3(activePath))
    throw new Error("No active sessions found");
  const activeContent = await fs2.readFile(activePath, "utf8");
  const active = JSON.parse(activeContent);
  let childSessionId = null;
  for (const [id, _session] of Object.entries(active)) {
    const sessionMetaPath = path4.join(options.aloopDir, "sessions", id, "meta.json");
    if (existsSync3(sessionMetaPath)) {
      const meta = JSON.parse(await fs2.readFile(sessionMetaPath, "utf8"));
      if (meta.issue_number === request.payload.issue_number || meta.gh_issue_number === request.payload.issue_number) {
        childSessionId = id;
        break;
      }
    }
  }
  if (!childSessionId) {
    const historyPath = path4.join(options.aloopDir, "history.json");
    if (existsSync3(historyPath)) {
      const historyContent = await fs2.readFile(historyPath, "utf8");
      const history = JSON.parse(historyContent);
      if (Array.isArray(history)) {
        for (const session of history) {
          if (session.issue_number === request.payload.issue_number) {
            childSessionId = session.session_id;
            break;
          }
        }
      }
    }
  }
  if (!childSessionId)
    throw new Error(`Could not find child session for issue #${request.payload.issue_number}`);
  const childSessionDir = path4.join(options.aloopDir, "sessions", childSessionId);
  const steerContent = await fs2.readFile(path4.join(options.workdir, request.payload.prompt_file), "utf8");
  await writeQueueOverride(childSessionDir, "steer", steerContent, {
    agent: "steer",
    type: "remote_steering_override",
    request_id: request.id
  });
  await writeSuccessToQueue(request, { status: "steered", session_id: childSessionId }, options, fileName);
}
async function handleStopChild(request, fileName, options) {
  const args = [
    "gh",
    "stop",
    "--issue",
    String(request.payload.issue_number),
    "--home-dir",
    path4.dirname(options.aloopDir),
    "--output",
    "json"
  ];
  const spawn3 = options.spawnSync || spawnSync2;
  const result = spawn3("aloop", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Failed to stop child: ${result.stderr || result.stdout}`);
  }
  await writeSuccessToQueue(request, { status: "stopped" }, options, fileName);
}
async function handlePostComment(request, fileName, options) {
  const body = await fs2.readFile(path4.join(options.workdir, request.payload.body_file), "utf8");
  const tempRequestPath = path4.join(options.aloopDir, "requests", `_tmp_${request.id}.json`);
  await fs2.writeFile(tempRequestPath, JSON.stringify({
    type: "issue-comment",
    issue_number: request.payload.issue_number,
    body
  }));
  const result = await options.ghCommandRunner("issue-comment", options.sessionId, tempRequestPath);
  await fs2.unlink(tempRequestPath);
  if (result.exitCode !== 0)
    throw new Error(result.output);
  await writeSuccessToQueue(request, { status: "posted" }, options, fileName);
}
async function handleQueryIssues(request, fileName, options) {
  const args = ["issue", "list", "--json", "number,title,state,labels", "--limit", "100"];
  if (request.payload.labels) {
    for (const l of request.payload.labels)
      args.push("--label", l);
  }
  if (request.payload.state)
    args.push("--state", request.payload.state);
  const spawn3 = options.spawnSync || spawnSync2;
  const result = spawn3("gh", args, { encoding: "utf8" });
  if (result.status !== 0)
    throw new Error(result.stderr);
  await writeSuccessToQueue(request, { issues: JSON.parse(result.stdout) }, options, fileName);
}
async function handleSpecBackfill(request, fileName, options) {
  const content = await fs2.readFile(path4.join(options.workdir, request.payload.content_file), "utf8");
  let iteration = 0;
  try {
    const statusRaw = await fs2.readFile(path4.join(options.sessionDir, "status.json"), "utf8");
    const status = JSON.parse(statusRaw);
    if (typeof status.iteration === "number")
      iteration = status.iteration;
  } catch {
  }
  const spawn3 = options.spawnSync || spawnSync2;
  const execGit = async (args, cwd) => {
    const result = spawn3("git", cwd ? ["-C", cwd, ...args] : args, { encoding: "utf8" });
    if (result.status !== 0)
      throw new Error(result.stderr || "git failed");
    return { stdout: result.stdout || "", stderr: result.stderr || "" };
  };
  await writeSpecBackfill({
    specFile: request.payload.file,
    section: request.payload.section,
    content,
    sessionId: options.sessionId,
    iteration,
    projectRoot: options.workdir,
    deps: { readFile: (p, enc) => fs2.readFile(p, enc), writeFile: (p, d, enc) => fs2.writeFile(p, d, enc), execGit }
  });
  await writeSuccessToQueue(request, { status: "backfilled", file: request.payload.file }, options, fileName);
}
async function writeSuccessToQueue(request, payload, options, sourceFileName) {
  const queueDir = path4.join(options.sessionDir, "queue");
  await fs2.mkdir(queueDir, { recursive: true });
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const baseName = path4.basename(sourceFileName, path4.extname(sourceFileName));
  const fileName = `${baseName}-${(/* @__PURE__ */ new Date()).getTime()}-${request.type}-${request.id}.md`;
  const queuePath = path4.join(queueDir, fileName);
  const frontmatter = {
    type: "queue_override",
    request_id: request.id,
    request_type: request.type,
    status: "success",
    payload,
    timestamp
  };
  const content = [
    "---",
    JSON.stringify(frontmatter, null, 2),
    "---",
    "",
    `Request \`${request.id}\` (${request.type}) completed successfully at ${timestamp}.`,
    "",
    "```json",
    JSON.stringify(payload, null, 2),
    "```"
  ].join("\n");
  await fs2.writeFile(queuePath, content, "utf8");
}
async function writeFailureToQueue(request, error, options, sourceFileName) {
  const queueDir = path4.join(options.sessionDir, "queue");
  await fs2.mkdir(queueDir, { recursive: true });
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const baseName = path4.basename(sourceFileName, path4.extname(sourceFileName));
  const fileName = `${baseName}-failed-${(/* @__PURE__ */ new Date()).getTime()}-${request.type}-${request.id}.md`;
  const queuePath = path4.join(queueDir, fileName);
  const frontmatter = {
    type: "queue_override",
    request_id: request.id,
    request_type: request.type,
    status: "error",
    error,
    timestamp
  };
  const content = [
    "---",
    JSON.stringify(frontmatter, null, 2),
    "---",
    "",
    `Request \`${request.id}\` (${request.type}) failed at ${timestamp}.`,
    "",
    `**Error:** ${error}`
  ].join("\n");
  await fs2.writeFile(queuePath, content, "utf8");
}

// src/lib/monitor.ts
import * as fs3 from "node:fs/promises";
import { existsSync as existsSync4 } from "node:fs";
import * as path5 from "node:path";

// src/lib/yaml.ts
function stripInlineComment(raw) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (char === "#" && !inSingle && !inDouble) {
      const prev = i > 0 ? raw[i - 1] : " ";
      if (prev === " " || prev === "	") {
        return raw.slice(0, i).trimEnd();
      }
    }
  }
  return raw.trimEnd();
}
function parseYamlScalar(raw) {
  const cleaned = stripInlineComment(raw).trim();
  if (cleaned === "")
    return "";
  if (/^null$/i.test(cleaned))
    return null;
  if (/^true$/i.test(cleaned))
    return true;
  if (/^false$/i.test(cleaned))
    return false;
  if (/^-?\d+$/.test(cleaned))
    return Number.parseInt(cleaned, 10);
  if (cleaned.startsWith("'") && cleaned.endsWith("'") && cleaned.length >= 2) {
    return cleaned.slice(1, -1).replace(/''/g, "'");
  }
  if (cleaned.startsWith('"') && cleaned.endsWith('"') && cleaned.length >= 2) {
    return cleaned.slice(1, -1).replace(/\\"/g, '"');
  }
  return cleaned;
}
function parseYaml(content) {
  const lines = content.split(/\r?\n/);
  const result = {};
  let currentKey = null;
  let currentList = null;
  let currentObject = null;
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (trimmed === "" || trimmed.startsWith("#"))
      continue;
    const indent = rawLine.length - rawLine.trimStart().length;
    if (indent === 0) {
      const match = trimmed.match(/^([A-Za-z0-9_]+):(?:\s*(.*))?$/);
      if (match) {
        currentKey = match[1];
        const rawValue = (match[2] ?? "").trim();
        if (rawValue === "") {
          result[currentKey] = null;
        } else {
          result[currentKey] = parseYamlScalar(rawValue);
          currentKey = null;
        }
        currentList = null;
        currentObject = null;
        continue;
      }
    }
    if (indent >= 2 && currentKey) {
      const listMatch = trimmed.match(/^-\s+(.+)$/);
      if (listMatch) {
        if (!Array.isArray(result[currentKey])) {
          result[currentKey] = [];
        }
        currentList = result[currentKey];
        const scalarValue = parseYamlScalar(listMatch[1]);
        if (currentList) {
          const objectMatch = listMatch[1].match(/^([A-Za-z0-9_]+):\s*(.*)$/);
          if (objectMatch) {
            currentObject = {};
            currentObject[objectMatch[1]] = parseYamlScalar(objectMatch[2]);
            currentList.push(currentObject);
          } else {
            currentList.push(scalarValue);
            currentObject = null;
          }
        }
        continue;
      }
      const propMatch = trimmed.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
      if (propMatch) {
        const propKey = propMatch[1];
        const propValue = parseYamlScalar(propMatch[2]);
        if (currentObject && indent >= 4) {
          currentObject[propKey] = propValue;
        } else {
          if (result[currentKey] === null || typeof result[currentKey] !== "object") {
            result[currentKey] = {};
          }
          result[currentKey][propKey] = propValue;
        }
        continue;
      }
    }
  }
  return result;
}

// src/lib/monitor.ts
async function getTodoTaskCounts(workdir) {
  const planPath = path5.join(workdir, "TODO.md");
  if (!existsSync4(planPath))
    return null;
  try {
    const content = await fs3.readFile(planPath, "utf8");
    const lines = content.split("\n");
    let incomplete = 0;
    let completed = 0;
    for (const line of lines) {
      if (/^\s*- \[ \]/.test(line)) {
        incomplete++;
      } else if (/^\s*- \[x\]/.test(line)) {
        completed++;
      }
    }
    return { incomplete, completed };
  } catch {
    return null;
  }
}
function extractFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  return match ? match[1] : null;
}
function normalizeTriggerValues(trigger) {
  if (typeof trigger === "string") {
    return trigger.split(",").map((value) => value.trim()).filter(Boolean);
  }
  if (Array.isArray(trigger)) {
    return trigger.filter((value) => typeof value === "string").map((value) => value.trim()).filter(Boolean);
  }
  return [];
}
async function findTriggeredTemplates(promptsDir, event) {
  const entries = await fs3.readdir(promptsDir).catch(() => []);
  const promptFiles = entries.filter((name) => /^PROMPT_.*\.md$/i.test(name)).sort();
  const matches = [];
  for (const fileName of promptFiles) {
    const templatePath = path5.join(promptsDir, fileName);
    const templateContent = await fs3.readFile(templatePath, "utf8").catch(() => null);
    if (!templateContent)
      continue;
    const frontmatter = extractFrontmatter(templateContent);
    if (!frontmatter)
      continue;
    const parsed = parseYaml(frontmatter);
    const triggers = normalizeTriggerValues(parsed.trigger);
    if (!triggers.includes(event))
      continue;
    const stem = fileName.replace(/\.md$/i, "");
    const fallbackAgent = stem.replace(/^PROMPT_/i, "");
    const agent = typeof parsed.agent === "string" && parsed.agent.trim().length > 0 ? parsed.agent.trim() : fallbackAgent;
    matches.push({ fileName, agent });
  }
  return matches;
}
async function queueTemplatesForEvent(options, event) {
  const templates = await findTriggeredTemplates(options.promptsDir, event);
  if (templates.length === 0)
    return 0;
  const queueDir = path5.join(options.sessionDir, "queue");
  const queueEntries = await fs3.readdir(queueDir).catch(() => []);
  let queued = 0;
  for (const template of templates) {
    const stem = template.fileName.replace(/\.md$/i, "");
    const alreadyQueued = queueEntries.some((entry) => entry.includes(stem));
    if (alreadyQueued)
      continue;
    const templatePath = path5.join(options.promptsDir, template.fileName);
    if (!existsSync4(templatePath))
      continue;
    const content = await fs3.readFile(templatePath, "utf8");
    await writeQueueOverride(options.sessionDir, stem, content, {
      agent: template.agent,
      reason: `triggered_by_${event}`,
      trigger: event,
      type: "event_dispatch"
    });
    console.log(`[monitor] Event '${event}' queued ${template.fileName}.`);
    queued++;
  }
  return queued;
}
async function monitorSessionState(options) {
  const statusPath = path5.join(options.sessionDir, "status.json");
  if (!existsSync4(statusPath))
    return;
  let status;
  try {
    const content = await fs3.readFile(statusPath, "utf8");
    status = JSON.parse(content);
  } catch {
    return;
  }
  if (status.state !== "running" && status.state !== "starting")
    return;
  const plan = await readLoopPlan(options.sessionDir);
  if (!plan)
    return;
  const queueDir = path5.join(options.sessionDir, "queue");
  const steeringPath = path5.join(options.workdir, "STEERING.md");
  if (existsSync4(steeringPath)) {
    const queueEntries = await fs3.readdir(queueDir).catch(() => []);
    const steerAlreadyQueued = queueEntries.some(
      (e) => e.includes("PROMPT_steer") || e.includes("-steering.")
    );
    const planAlreadyQueued = queueEntries.some((e) => e.includes("PROMPT_plan"));
    if (!steerAlreadyQueued) {
      const steerTemplatePath = path5.join(options.promptsDir, "PROMPT_steer.md");
      const planTemplatePath = path5.join(options.promptsDir, "PROMPT_plan.md");
      if (existsSync4(steerTemplatePath)) {
        const steeringInstruction = await fs3.readFile(steeringPath, "utf8");
        await queueSteeringPrompt(
          options.sessionDir,
          options.promptsDir,
          steeringInstruction,
          "001-PROMPT_steer",
          {
            agent: "steer",
            reason: "steering_detected",
            type: "steering_override"
          }
        );
        console.log("[monitor] STEERING.md detected; queued steer.");
        if (!planAlreadyQueued && existsSync4(planTemplatePath)) {
          const planContent = await fs3.readFile(planTemplatePath, "utf8");
          await writeQueueOverride(options.sessionDir, "002-PROMPT_plan", planContent, {
            agent: "plan",
            reason: "post_steer_replan",
            type: "steering_override"
          });
          console.log("[monitor] Steering follow-up queued plan.");
        }
        await mutateLoopPlan(options.sessionDir, {
          cyclePosition: 0,
          allTasksMarkedDone: false
        });
      } else {
        console.warn(
          `[monitor] STEERING.md found but PROMPT_steer.md is missing in ${options.promptsDir} \u2014 steering skipped.`
        );
      }
    }
  }
  const taskCounts = await getTodoTaskCounts(options.workdir);
  const allTasksDone = taskCounts !== null && taskCounts.incomplete === 0 && taskCounts.completed > 0;
  if (status.phase === "build" && taskCounts !== null && taskCounts.incomplete === 0 && taskCounts.completed === 0) {
    const queueEntries = await fs3.readdir(queueDir).catch(() => []);
    const alreadyQueued = queueEntries.some((e) => e.includes("PROMPT_plan"));
    if (!alreadyQueued) {
      const planTemplatePath = path5.join(options.promptsDir, "PROMPT_plan.md");
      if (existsSync4(planTemplatePath)) {
        const content = await fs3.readFile(planTemplatePath, "utf8");
        await writeQueueOverride(options.sessionDir, "PROMPT_plan", content, {
          agent: "plan",
          reason: "build_prerequisite_no_tasks"
        });
        console.log(`[monitor] Build phase reached with no TODO tasks; queued plan.`);
      }
    }
  }
  if (allTasksDone && typeof status.phase === "string") {
    if (status.phase === "build") {
      const queued = await queueTemplatesForEvent(options, "all_tasks_done");
      if (queued > 0) {
        await mutateLoopPlan(options.sessionDir, { allTasksMarkedDone: true });
      }
    } else {
      const queued = await queueTemplatesForEvent(options, status.phase);
      if (queued === 0 && plan.allTasksMarkedDone) {
        console.log(`[monitor] Rattail chain complete (phase: ${status.phase}). Session completed.`);
        const nextStatus = { ...status, state: "completed", updated_at: (/* @__PURE__ */ new Date()).toISOString() };
        await fs3.writeFile(statusPath, JSON.stringify(nextStatus, null, 2));
        const metaPath = path5.join(options.sessionDir, "meta.json");
        try {
          const meta = JSON.parse(await fs3.readFile(metaPath, "utf8"));
          if (meta.pid) {
            process.kill(meta.pid, "SIGTERM");
          }
        } catch {
        }
      }
    }
  }
  if (plan.allTasksMarkedDone && !allTasksDone && taskCounts !== null && taskCounts.incomplete > 0) {
    console.log(`[monitor] New incomplete tasks during rattail; re-entering build cycle.`);
    await mutateLoopPlan(options.sessionDir, {
      cyclePosition: 0,
      allTasksMarkedDone: false
    });
    const queueEntries = await fs3.readdir(queueDir).catch(() => []);
    if (!queueEntries.some((e) => e.includes("PROMPT_plan"))) {
      const planTemplatePath = path5.join(options.promptsDir, "PROMPT_plan.md");
      if (existsSync4(planTemplatePath)) {
        const content = await fs3.readFile(planTemplatePath, "utf8");
        await writeQueueOverride(options.sessionDir, "PROMPT_plan", content, {
          agent: "plan",
          reason: "rattail_reentry_new_tasks",
          type: "event_dispatch"
        });
        console.log("[monitor] Queued plan for rattail re-entry.");
      }
    }
  }
}

// src/commands/dashboard.ts
var DOC_FILES = ["TODO.md", "SPEC.md", "RESEARCH.md", "REVIEW_LOG.md", "STEERING.md"];
var MAX_LOG_BYTES = 1024 * 1024;
var MAX_BODY_BYTES = 64 * 1024;
var DEFAULT_HEARTBEAT_INTERVAL_MS = 15e3;
var DEFAULT_REQUEST_POLL_INTERVAL_MS = 1e3;
function parsePort(value) {
  const port = Number.parseInt(value, 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port "${value}". Expected a number between 1 and 65535.`);
  }
  return port;
}
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
async function readJsonFile(filePath) {
  try {
    const raw = await fs4.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
async function readJsonArrayFile(filePath) {
  const value = await readJsonFile(filePath);
  if (Array.isArray(value))
    return value;
  if (isRecord(value))
    return Object.values(value);
  return [];
}
async function readTextFile(filePath) {
  try {
    return await fs4.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}
async function readLogTail(filePath) {
  try {
    const buffer = await fs4.readFile(filePath);
    const start = Math.max(0, buffer.length - MAX_LOG_BYTES);
    const raw = buffer.subarray(start).toString("utf8");
    if (start > 0) {
      const nl = raw.indexOf("\n");
      return nl >= 0 ? raw.slice(nl + 1) : raw;
    }
    return raw;
  } catch {
    return "";
  }
}
async function fileExists2(filePath) {
  try {
    const stats = await fs4.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}
async function loadArtifactManifests(sessionDir) {
  const artifactsDir = path6.join(sessionDir, "artifacts");
  let entries;
  try {
    entries = await fs4.readdir(artifactsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const iterDirs = entries.filter((entry) => entry.isDirectory() && /^iter-\d+$/.test(entry.name)).sort((a, b) => {
    const numA = Number.parseInt(a.name.slice(5), 10);
    const numB = Number.parseInt(b.name.slice(5), 10);
    return numA - numB;
  });
  const results = [];
  for (const dir of iterDirs) {
    const iteration = Number.parseInt(dir.name.slice(5), 10);
    const manifestPath = path6.join(artifactsDir, dir.name, "proof-manifest.json");
    const outputPath = path6.join(artifactsDir, dir.name, "output.txt");
    const manifest = await readJsonFile(manifestPath);
    let outputHeader;
    try {
      const buf = await fs4.readFile(outputPath, "utf-8");
      outputHeader = buf.slice(0, 500).split("\n").slice(0, 5).join("\n");
    } catch {
    }
    if (manifest !== null || outputHeader) {
      results.push({ iteration, manifest: manifest ?? null, outputHeader });
    }
  }
  return results;
}
async function resolveSessionContext(runtimeDir, sessionId) {
  const activeSessionsPath = path6.join(runtimeDir, "active.json");
  const active = await readJsonFile(activeSessionsPath);
  if (!isRecord(active)) {
    return null;
  }
  const entry = active[sessionId];
  if (!isRecord(entry)) {
    return null;
  }
  const sessionDir = typeof entry.session_dir === "string" ? entry.session_dir : path6.join(runtimeDir, "sessions", sessionId);
  const workdir = typeof entry.work_dir === "string" ? entry.work_dir : process.cwd();
  const pid = typeof entry.pid === "number" && Number.isInteger(entry.pid) && entry.pid > 0 ? entry.pid : null;
  return { sessionDir, workdir, pid };
}
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = error.code;
    return code === "EPERM";
  }
}
function withLivenessCorrectedState(status, pid) {
  if (!isRecord(status) || status.state !== "running" || pid === null) {
    return status;
  }
  if (isProcessAlive(pid)) {
    return status;
  }
  return {
    ...status,
    state: "exited"
  };
}
async function resolvePid(ctx, meta, runtimeDir) {
  let pid = ctx.pid ?? extractPid(meta) ?? null;
  if (pid === null || !isProcessAlive(pid)) {
    const sessionId = path6.basename(ctx.sessionDir);
    const active = await readJsonFile(path6.join(runtimeDir, "active.json"));
    if (isRecord(active)) {
      const entry = active[sessionId];
      if (isRecord(entry) && typeof entry.pid === "number" && entry.pid > 0) {
        pid = entry.pid;
      }
    }
  }
  return pid;
}
function getRepoUrl(workdir) {
  try {
    const remote = spawnSync3("git", ["remote", "get-url", "origin"], { cwd: workdir, timeout: 3e3, encoding: "utf-8" });
    const url = (remote.stdout ?? "").trim();
    if (!url)
      return null;
    const sshMatch = url.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
    if (sshMatch)
      return `https://${sshMatch[1]}/${sshMatch[2]}`;
    const httpsMatch = url.match(/^https?:\/\/(.+?)(?:\.git)?$/);
    if (httpsMatch)
      return `https://${httpsMatch[1]}`;
    return url;
  } catch {
    return null;
  }
}
async function loadStateForContext(ctx, runtimeDir) {
  const statusPath = path6.join(ctx.sessionDir, "status.json");
  const metaPath = path6.join(ctx.sessionDir, "meta.json");
  const logPath = path6.join(ctx.sessionDir, "log.jsonl");
  const activeSessionsPath = path6.join(runtimeDir, "active.json");
  const recentSessionsPath = path6.join(runtimeDir, "history.json");
  const [status, meta, log, activeSessions, recentSessions, docsEntries, artifacts] = await Promise.all([
    readJsonFile(statusPath),
    readJsonFile(metaPath),
    readLogTail(logPath),
    readJsonArrayFile(activeSessionsPath),
    readJsonArrayFile(recentSessionsPath),
    Promise.all(
      DOC_FILES.map(async (docFile) => {
        const content = await readTextFile(path6.join(ctx.workdir, docFile));
        return [docFile, content];
      })
    ),
    loadArtifactManifests(ctx.sessionDir)
  ]);
  const pid = await resolvePid(ctx, meta, runtimeDir);
  const correctedStatus = withLivenessCorrectedState(status, pid);
  const enrichedActive = await Promise.all(
    activeSessions.map(async (entry) => {
      if (!isRecord(entry))
        return entry;
      const dir = typeof entry.session_dir === "string" ? entry.session_dir : null;
      if (!dir)
        return entry;
      const sStatus = await readJsonFile(path6.join(dir, "status.json"));
      if (isRecord(sStatus)) {
        return { ...entry, ...sStatus };
      }
      return entry;
    })
  );
  const enrichedRecent = await Promise.all(
    recentSessions.map(async (entry) => {
      if (!isRecord(entry))
        return entry;
      const dir = typeof entry.session_dir === "string" ? entry.session_dir : null;
      if (!dir)
        return entry;
      const sStatus = await readJsonFile(path6.join(dir, "status.json"));
      if (isRecord(sStatus)) {
        return { ...entry, ...sStatus };
      }
      return entry;
    })
  );
  return {
    sessionDir: ctx.sessionDir,
    workdir: ctx.workdir,
    runtimeDir,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    status: correctedStatus,
    log,
    docs: Object.fromEntries(docsEntries),
    activeSessions: enrichedActive,
    recentSessions: enrichedRecent,
    artifacts,
    meta,
    repoUrl: getRepoUrl(ctx.workdir)
  };
}
function normalizeProcessOutput(stdout, stderr) {
  return [stdout, stderr].map((value) => value.trim()).filter((value) => value.length > 0).join("\n").trim();
}
async function defaultGhCommandRunner(operation, sessionId, requestPath) {
  try {
    const result = spawnSync3("aloop", ["gh", operation, "--session", sessionId, "--request", requestPath], {
      encoding: "utf8"
    });
    return {
      exitCode: result.status ?? 1,
      output: normalizeProcessOutput(String(result.stdout ?? ""), String(result.stderr ?? ""))
    };
  } catch (error) {
    return {
      exitCode: 1,
      output: error.message
    };
  }
}
async function processGhConventionRequests(workdir, sessionId, logPath, ghCommandRunner) {
  const aloopDir = path6.join(workdir, ".aloop");
  const sessionDir = path6.dirname(logPath);
  await processAgentRequests({
    workdir,
    sessionId,
    aloopDir,
    sessionDir,
    logPath,
    ghCommandRunner
  });
}
async function resolveDefaultAssetsDir() {
  const devAssetsDir = path6.join(process.cwd(), "dashboard", "dist");
  const moduleFilePath = fileURLToPath2(import.meta.url);
  const moduleDir = path6.dirname(moduleFilePath);
  const runtimeScriptPath = process.argv[1] ? path6.resolve(process.argv[1]) : null;
  const candidates = /* @__PURE__ */ new Set();
  if (runtimeScriptPath) {
    candidates.add(path6.join(path6.dirname(runtimeScriptPath), "dashboard"));
  }
  candidates.add(path6.join(moduleDir, "dashboard"));
  candidates.add(path6.resolve(moduleDir, "..", "dashboard"));
  candidates.add(path6.resolve(moduleDir, "..", "..", "dashboard", "dist"));
  candidates.add(devAssetsDir);
  for (const candidateDir of candidates) {
    if (await fileExists2(path6.join(candidateDir, "index.html"))) {
      return candidateDir;
    }
  }
  return devAssetsDir;
}
function toStateEventPayload(state) {
  return JSON.stringify(state);
}
function sendSseEvent(response, event, payload) {
  response.write(`event: ${event}
`);
  for (const line of payload.split("\n")) {
    response.write(`data: ${line}
`);
  }
  response.write("\n");
}
function getContentType(filePath) {
  const ext = path6.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".mjs":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".ico":
      return "image/x-icon";
    default:
      return "application/octet-stream";
  }
}
function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}
function extractPid(meta) {
  if (!isRecord(meta)) {
    return null;
  }
  const pid = meta.pid;
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) {
    return null;
  }
  return pid;
}
async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  let tooLarge = false;
  await new Promise((resolve2, reject) => {
    request.on("data", (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (tooLarge) {
        return;
      }
      size += buffer.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        return;
      }
      chunks.push(buffer);
    });
    request.on("end", () => {
      if (tooLarge) {
        reject(new Error(`Request body too large (max ${MAX_BODY_BYTES} bytes).`));
        return;
      }
      resolve2();
    });
    request.on("error", (error) => reject(error));
  });
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (raw.length === 0) {
    return {};
  }
  return JSON.parse(raw);
}
function buildSteeringDocument(instruction, affectsCompletedWork, commit) {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  return [
    "# Steering Instruction",
    "",
    `**Commit:** ${commit}`,
    `**Timestamp:** ${timestamp}`,
    `**Affects completed work:** ${affectsCompletedWork}`,
    "",
    "## Instruction",
    "",
    instruction,
    ""
  ].join("\n");
}
async function startDashboardServer(options, runtimeOptions = {}) {
  const registerSignalHandlers = runtimeOptions.registerSignalHandlers ?? true;
  const heartbeatIntervalMs = Math.max(250, runtimeOptions.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS);
  const requestPollIntervalMs = Math.max(250, runtimeOptions.requestPollIntervalMs ?? DEFAULT_REQUEST_POLL_INTERVAL_MS);
  const port = parsePort(options.port);
  const sessionDir = path6.resolve(options.sessionDir ?? process.cwd());
  const workdir = path6.resolve(options.workdir ?? process.cwd());
  const assetsDir = path6.resolve(options.assetsDir ?? await resolveDefaultAssetsDir());
  const runtimeDir = path6.resolve(options.runtimeDir ?? path6.join(os2.homedir(), ".aloop"));
  const ghCommandRunner = runtimeOptions.ghCommandRunner ?? defaultGhCommandRunner;
  const sessionId = path6.basename(sessionDir);
  const statusPath = path6.join(sessionDir, "status.json");
  const logPath = path6.join(sessionDir, "log.jsonl");
  const metaPath = path6.join(sessionDir, "meta.json");
  const activeSessionsPath = path6.join(runtimeDir, "active.json");
  const recentSessionsPath = path6.join(runtimeDir, "history.json");
  const steeringPath = path6.join(workdir, "STEERING.md");
  const requestsDir = path6.join(workdir, ".aloop", "requests");
  const normalizedRequestsDir = path6.normalize(requestsDir).toLowerCase();
  const docPaths = DOC_FILES.map((name) => path6.join(workdir, name));
  const watchedFiles = new Set(
    [statusPath, logPath, activeSessionsPath, recentSessionsPath, ...docPaths].map(
      (value) => path6.normalize(value).toLowerCase()
    )
  );
  const defaultContext = { sessionDir, workdir };
  const clients = /* @__PURE__ */ new Map();
  const watchers = /* @__PURE__ */ new Map();
  const loadState = async () => {
    return loadStateForContext(defaultContext, runtimeDir);
  };
  let publishPending = false;
  let publishTimer = null;
  const sendToClients = (event, payload) => {
    for (const [client] of clients) {
      try {
        sendSseEvent(client, event, payload);
      } catch {
        clients.delete(client);
        client.destroy();
      }
    }
  };
  const publishState = async () => {
    publishPending = false;
    publishTimer = null;
    try {
      const contextPayloads = /* @__PURE__ */ new Map();
      for (const [client, ctx] of clients) {
        const key = `${ctx.sessionDir}\0${ctx.workdir}`;
        let payload = contextPayloads.get(key);
        if (payload === void 0) {
          const state = ctx === defaultContext ? await loadState() : await loadStateForContext(ctx, runtimeDir);
          payload = toStateEventPayload(state);
          contextPayloads.set(key, payload);
        }
        try {
          sendSseEvent(client, "state", payload);
        } catch {
          clients.delete(client);
          client.destroy();
        }
      }
    } catch (error) {
      console.warn(`dashboard: failed to publish state: ${error.message}`);
    }
  };
  const schedulePublish = () => {
    if (publishPending) {
      return;
    }
    publishPending = true;
    publishTimer = setTimeout(() => {
      void publishState();
    }, 75);
  };
  const heartbeatTimer = setInterval(() => {
    const heartbeatPayload = JSON.stringify({ timestamp: (/* @__PURE__ */ new Date()).toISOString() });
    sendToClients("heartbeat", heartbeatPayload);
  }, heartbeatIntervalMs);
  heartbeatTimer.unref();
  let requestProcessingActive = false;
  let requestProcessingQueued = false;
  const runRequestProcessing = () => {
    if (requestProcessingActive) {
      requestProcessingQueued = true;
      return;
    }
    requestProcessingActive = true;
    const promptsDir = path6.join(sessionDir, "prompts");
    Promise.all([
      processGhConventionRequests(workdir, sessionId, logPath, ghCommandRunner),
      monitorSessionState({ sessionDir, workdir, promptsDir }).catch((error) => {
        console.warn(`dashboard: session monitor failed: ${error.message}`);
      })
    ]).catch((error) => {
      console.warn(`dashboard: failed to process GH convention requests or monitor state: ${error.message}`);
    }).finally(() => {
      requestProcessingActive = false;
      if (requestProcessingQueued) {
        requestProcessingQueued = false;
        runRequestProcessing();
      }
    });
  };
  runRequestProcessing();
  const requestPollTimer = setInterval(() => {
    runRequestProcessing();
  }, requestPollIntervalMs);
  requestPollTimer.unref();
  const watchPaths = [sessionDir, workdir, runtimeDir, requestsDir];
  for (const target of watchPaths) {
    try {
      const watcher = watch(target, (_eventType, filename) => {
        if (!filename) {
          return;
        }
        const changed = path6.normalize(path6.join(target, filename.toString())).toLowerCase();
        if (changed === normalizedRequestsDir || changed.startsWith(`${normalizedRequestsDir}${path6.sep}`)) {
          runRequestProcessing();
        }
        if (watchedFiles.has(changed) || changed.endsWith(".md")) {
          schedulePublish();
        }
      });
      watchers.set(target, watcher);
    } catch (error) {
      if (target === requestsDir && error.code === "ENOENT") {
        continue;
      }
      console.warn(`dashboard: unable to watch ${target}: ${error.message}`);
    }
  }
  const server = createServer((request, response) => {
    const handleRequest2 = async () => {
      const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
      if (requestUrl.pathname === "/api/state" && request.method === "GET") {
        const targetSessionId = requestUrl.searchParams.get("session");
        if (targetSessionId) {
          const ctx = await resolveSessionContext(runtimeDir, targetSessionId);
          if (!ctx) {
            writeJson(response, 404, { error: `Session not found: ${targetSessionId}` });
            return;
          }
          const state2 = await loadStateForContext(ctx, runtimeDir);
          writeJson(response, 200, state2);
          return;
        }
        const state = await loadState();
        writeJson(response, 200, state);
        return;
      }
      if (requestUrl.pathname === "/events" && request.method === "GET") {
        response.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive"
        });
        response.write(": connected\n\n");
        const targetSessionId = requestUrl.searchParams.get("session");
        let clientContext = defaultContext;
        if (targetSessionId) {
          const ctx = await resolveSessionContext(runtimeDir, targetSessionId);
          if (!ctx) {
            sendSseEvent(
              response,
              "error",
              JSON.stringify({ message: `Session not found: ${targetSessionId}` })
            );
            response.end();
            return;
          }
          clientContext = ctx;
        }
        clients.set(response, clientContext);
        try {
          const initialState = clientContext === defaultContext ? await loadState() : await loadStateForContext(clientContext, runtimeDir);
          sendSseEvent(response, "state", toStateEventPayload(initialState));
        } catch (error) {
          sendSseEvent(
            response,
            "error",
            JSON.stringify({ message: `Failed to load initial state: ${error.message}` })
          );
        }
        request.on("close", () => {
          clients.delete(response);
        });
        return;
      }
      if (requestUrl.pathname === "/api/steer") {
        if (request.method !== "POST") {
          writeJson(response, 405, { error: "Method not allowed. Use POST /api/steer." });
          return;
        }
        let parsedBody;
        try {
          parsedBody = await readJsonBody(request);
        } catch (error) {
          writeJson(response, 400, { error: `Invalid request body: ${error.message}` });
          return;
        }
        if (!isRecord(parsedBody)) {
          writeJson(response, 400, { error: "Request body must be a JSON object." });
          return;
        }
        const instruction = parsedBody.instruction;
        if (typeof instruction !== "string" || instruction.trim().length === 0) {
          writeJson(response, 400, { error: 'Field "instruction" is required and must be a non-empty string.' });
          return;
        }
        const overwrite = parsedBody.overwrite;
        if (overwrite !== void 0 && typeof overwrite !== "boolean") {
          writeJson(response, 400, { error: 'Field "overwrite" must be a boolean when provided.' });
          return;
        }
        const affectsCompletedWork = parsedBody.affects_completed_work;
        if (affectsCompletedWork !== void 0 && affectsCompletedWork !== "yes" && affectsCompletedWork !== "no" && affectsCompletedWork !== "unknown") {
          writeJson(response, 400, {
            error: 'Field "affects_completed_work" must be one of: yes, no, unknown.'
          });
          return;
        }
        if (await fileExists2(steeringPath) && overwrite !== true) {
          writeJson(response, 409, {
            error: "A steering instruction is already queued. Resubmit with overwrite=true to replace it."
          });
          return;
        }
        const commit = typeof parsedBody.commit === "string" && parsedBody.commit.trim().length > 0 ? parsedBody.commit.trim() : "unknown";
        const steeringDoc = buildSteeringDocument(
          instruction.trim(),
          affectsCompletedWork ?? "unknown",
          commit
        );
        await fs4.writeFile(steeringPath, steeringDoc, "utf8");
        const promptsDir = path6.join(sessionDir, "prompts");
        const queuePath = await queueSteeringPrompt(
          sessionDir,
          promptsDir,
          steeringDoc
        );
        writeJson(response, 201, {
          queued: true,
          path: queuePath,
          steeringPath
        });
        return;
      }
      if (requestUrl.pathname === "/api/plan") {
        if (request.method === "GET") {
          const plan = await readLoopPlan(sessionDir);
          if (!plan) {
            writeJson(response, 404, { error: "loop-plan.json not found." });
            return;
          }
          writeJson(response, 200, plan);
          return;
        }
        if (request.method === "POST") {
          let parsedBody;
          try {
            parsedBody = await readJsonBody(request);
          } catch (error) {
            writeJson(response, 400, { error: `Invalid request body: ${error.message}` });
            return;
          }
          if (!isRecord(parsedBody)) {
            writeJson(response, 400, { error: "Request body must be a JSON object." });
            return;
          }
          try {
            const plan = await mutateLoopPlan(sessionDir, parsedBody);
            writeJson(response, 200, plan);
          } catch (error) {
            writeJson(response, 500, { error: `Failed to mutate loop plan: ${error.message}` });
          }
          return;
        }
        writeJson(response, 405, { error: "Method not allowed. Use GET or POST /api/plan." });
        return;
      }
      if (requestUrl.pathname === "/api/stop") {
        if (request.method !== "POST") {
          writeJson(response, 405, { error: "Method not allowed. Use POST /api/stop." });
          return;
        }
        let parsedBody;
        try {
          parsedBody = await readJsonBody(request);
        } catch (error) {
          writeJson(response, 400, { error: `Invalid request body: ${error.message}` });
          return;
        }
        if (!isRecord(parsedBody)) {
          writeJson(response, 400, { error: "Request body must be a JSON object." });
          return;
        }
        const force = parsedBody.force;
        if (force !== void 0 && typeof force !== "boolean") {
          writeJson(response, 400, { error: 'Field "force" must be a boolean when provided.' });
          return;
        }
        const signal = force === true ? "SIGKILL" : "SIGTERM";
        const meta = await readJsonFile(metaPath);
        const pid = extractPid(meta);
        if (pid === null) {
          writeJson(response, 409, {
            error: `Cannot stop session without a valid pid in ${metaPath}.`
          });
          return;
        }
        if (pid === process.pid) {
          writeJson(response, 409, { error: "Refusing to stop dashboard process PID." });
          return;
        }
        try {
          process.kill(pid, signal);
        } catch (error) {
          const typedError = error;
          if (typedError.code === "ESRCH") {
            writeJson(response, 409, { error: `Process ${pid} is not running.` });
            return;
          }
          if (typedError.code === "EPERM") {
            writeJson(response, 403, { error: `Permission denied when signaling process ${pid}.` });
            return;
          }
          throw error;
        }
        const existingStatus = await readJsonFile(statusPath);
        const nextStatus = isRecord(existingStatus) ? { ...existingStatus } : {};
        nextStatus.state = "stopping";
        nextStatus.updated_at = (/* @__PURE__ */ new Date()).toISOString();
        await fs4.writeFile(statusPath, JSON.stringify(nextStatus), "utf8");
        writeJson(response, 202, {
          stopping: true,
          pid,
          signal
        });
        return;
      }
      if (requestUrl.pathname === "/api/resume") {
        if (request.method !== "POST") {
          writeJson(response, 405, { error: "Method not allowed. Use POST /api/resume." });
          return;
        }
        const meta = await readJsonFile(metaPath);
        if (!isRecord(meta)) {
          writeJson(response, 409, { error: "No meta.json found for this session." });
          return;
        }
        const existingPid = extractPid(meta);
        if (existingPid !== null) {
          try {
            process.kill(existingPid, 0);
            writeJson(response, 409, { error: `Session is already running (PID ${existingPid}).` });
            return;
          } catch {
          }
        }
        const lockFile = path6.join(sessionDir, "session.lock");
        try {
          await fs4.unlink(lockFile);
        } catch {
        }
        const loopScript = path6.join(workdir, "aloop", "bin", "loop.sh");
        const promptsDir = typeof meta.prompts_dir === "string" ? meta.prompts_dir : path6.join(sessionDir, "prompts");
        const maxIter = typeof meta.max_iterations === "number" ? String(meta.max_iterations) : "500";
        const provider = typeof meta.provider === "string" ? meta.provider : "round-robin";
        const mode = typeof meta.mode === "string" ? meta.mode : "plan-build-review";
        const child = spawn("bash", [
          loopScript,
          "--prompts-dir",
          promptsDir,
          "--session-dir",
          sessionDir,
          "--work-dir",
          workdir,
          "--max-iterations",
          maxIter,
          "--provider",
          provider,
          "--launch-mode",
          "resume",
          "--mode",
          mode
        ], {
          cwd: workdir,
          detached: true,
          stdio: "ignore"
        });
        child.unref();
        writeJson(response, 202, { resumed: true, pid: child.pid });
        return;
      }
      const artifactMatch = requestUrl.pathname.match(/^\/api\/artifacts\/(\d+)\/(.+)$/);
      if (artifactMatch && request.method === "GET") {
        const iteration = artifactMatch[1];
        const filename = artifactMatch[2];
        if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
          writeJson(response, 400, { error: "Invalid artifact filename." });
          return;
        }
        const artifactPath = path6.join(sessionDir, "artifacts", `iter-${iteration}`, filename);
        const resolvedPath = path6.resolve(artifactPath);
        const allowedPrefix = path6.resolve(path6.join(sessionDir, "artifacts")) + path6.sep;
        if (!resolvedPath.startsWith(allowedPrefix)) {
          writeJson(response, 400, { error: "Invalid artifact path." });
          return;
        }
        if (!await fileExists2(resolvedPath)) {
          writeJson(response, 404, { error: "Artifact not found." });
          return;
        }
        const content = await fs4.readFile(resolvedPath);
        response.writeHead(200, {
          "Content-Type": getContentType(resolvedPath),
          "Cache-Control": "no-cache"
        });
        response.end(content);
        return;
      }
      if (requestUrl.pathname.startsWith("/api/")) {
        writeJson(response, 404, { error: "Not found" });
        return;
      }
      const requestPath = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
      const normalizedRequestPath = path6.normalize(requestPath).replace(/^(\.\.(\/|\\|$))+/, "");
      const assetPath = path6.resolve(assetsDir, `.${normalizedRequestPath}`);
      if (assetPath.startsWith(assetsDir) && await fileExists2(assetPath)) {
        const content = await fs4.readFile(assetPath);
        response.writeHead(200, { "Content-Type": getContentType(assetPath), "Cache-Control": "no-cache" });
        response.end(content);
        return;
      }
      const indexPath = path6.join(assetsDir, "index.html");
      if (await fileExists2(indexPath)) {
        const indexContent = await fs4.readFile(indexPath);
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
        response.end(indexContent);
        return;
      }
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(
        `<!doctype html><html><body><h1>Aloop Dashboard</h1><p>Dashboard assets not found at <code>${assetsDir}</code>.</p></body></html>`
      );
    };
    void handleRequest2().catch((error) => {
      if (response.headersSent) {
        try {
          sendSseEvent(response, "error", JSON.stringify({ message: `Internal server error: ${error.message}` }));
        } catch {
        } finally {
          response.end();
        }
        return;
      }
      writeJson(response, 500, {
        error: `Internal server error: ${error.message}`
      });
    });
  });
  let closed = false;
  let shutdownPromise = null;
  const onSignal = (signal) => {
    void shutdown(signal);
  };
  const shutdown = async (_reason) => {
    if (shutdownPromise) {
      return shutdownPromise;
    }
    shutdownPromise = (async () => {
      if (closed) {
        return;
      }
      closed = true;
      if (registerSignalHandlers) {
        process.off("SIGINT", onSignal);
        process.off("SIGTERM", onSignal);
      }
      if (publishTimer) {
        clearTimeout(publishTimer);
        publishTimer = null;
      }
      clearInterval(heartbeatTimer);
      clearInterval(requestPollTimer);
      for (const watcher of watchers.values()) {
        watcher.close();
      }
      watchers.clear();
      for (const [client] of clients) {
        client.end();
      }
      clients.clear();
      await new Promise((resolve2) => {
        server.close(() => resolve2());
      });
    })();
    return shutdownPromise;
  };
  if (registerSignalHandlers) {
    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
  }
  await new Promise((resolve2, reject) => {
    const onError = (error) => {
      server.off("error", onError);
      reject(error);
    };
    server.once("error", onError);
    server.listen(port, () => {
      server.off("error", onError);
      resolve2();
    });
  });
  const address = server.address();
  const boundPort = typeof address === "object" && address ? address.port : port;
  return {
    close: shutdown,
    port: boundPort,
    url: `http://127.0.0.1:${boundPort}`
  };
}
async function dashboardCommand(options) {
  const sessionDir = path6.resolve(options.sessionDir ?? process.cwd());
  const workdir = path6.resolve(options.workdir ?? process.cwd());
  const assetsDir = path6.resolve(options.assetsDir ?? await resolveDefaultAssetsDir());
  const handle = await startDashboardServer({ ...options, assetsDir, sessionDir, workdir });
  console.log(`Launching real-time progress dashboard on port ${handle.port}...`);
  console.log(`Session dir: ${sessionDir}`);
  console.log(`Workdir: ${workdir}`);
  console.log(`Assets dir: ${assetsDir}`);
}

// lib/session.mjs
import { spawnSync as spawnSync4 } from "node:child_process";
import { readFile as readFile5, writeFile as writeFile5, readdir as readdir4 } from "node:fs/promises";
import { existsSync as existsSync5 } from "node:fs";
import os3 from "node:os";
import path7 from "node:path";
function resolveHomeDir(explicitHomeDir) {
  const resolved = path7.resolve(explicitHomeDir ?? os3.homedir());
  const { root } = path7.parse(resolved);
  if (resolved === root)
    return resolved;
  return resolved.replace(/[\\/]+$/, "");
}
async function readJsonFile2(filePath) {
  if (!existsSync5(filePath))
    return null;
  try {
    const content = await readFile5(filePath, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}
async function writeJsonFile(filePath, data) {
  await writeFile5(filePath, JSON.stringify(data, null, 2), "utf8");
}
async function readActiveSessions(homeDir) {
  const activePath = path7.join(homeDir, ".aloop", "active.json");
  const data = await readJsonFile2(activePath);
  if (!data || typeof data !== "object" || Array.isArray(data))
    return {};
  return data;
}
async function readSessionStatus(sessionDir) {
  const statusPath = path7.join(sessionDir, "status.json");
  return readJsonFile2(statusPath);
}
async function readProviderHealth(homeDir) {
  const healthDir = path7.join(homeDir, ".aloop", "health");
  if (!existsSync5(healthDir))
    return {};
  let files;
  try {
    files = await readdir4(healthDir);
  } catch {
    return {};
  }
  const health = {};
  for (const file of files) {
    if (!file.endsWith(".json"))
      continue;
    const provider = file.slice(0, -5);
    const data = await readJsonFile2(path7.join(healthDir, file));
    if (data)
      health[provider] = data;
  }
  return health;
}
async function listActiveSessions(homeDir) {
  const active = await readActiveSessions(homeDir);
  const sessions = [];
  for (const [sessionId, entry] of Object.entries(active)) {
    const sessionDir = entry.session_dir ?? path7.join(homeDir, ".aloop", "sessions", sessionId);
    const status = await readSessionStatus(sessionDir);
    sessions.push({
      session_id: sessionId,
      pid: entry.pid ?? null,
      work_dir: entry.work_dir ?? null,
      started_at: entry.started_at ?? null,
      provider: entry.provider ?? status?.provider ?? null,
      mode: entry.mode ?? null,
      state: status?.state ?? "unknown",
      phase: status?.phase ?? null,
      iteration: status?.iteration ?? null,
      stuck_count: status?.stuck_count ?? 0,
      updated_at: status?.updated_at ?? null
    });
  }
  return sessions;
}
function isProcessAlive2(pid) {
  if (!pid)
    return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function killProcess(pid) {
  if (process.platform === "win32") {
    const result = spawnSync4("taskkill", ["/PID", String(pid), "/F"], { encoding: "utf8" });
    return result.status === 0;
  }
  try {
    process.kill(pid, "SIGTERM");
    return true;
  } catch {
    return false;
  }
}
async function stopSession(homeDir, sessionId) {
  const active = await readActiveSessions(homeDir);
  const entry = active[sessionId];
  if (!entry) {
    return { success: false, reason: `Session not found: ${sessionId}` };
  }
  const sessionDir = entry.session_dir ?? path7.join(homeDir, ".aloop", "sessions", sessionId);
  const pid = entry.pid ?? null;
  if (pid && isProcessAlive2(pid)) {
    if (!killProcess(pid)) {
      return { success: false, reason: `Failed to stop session process: ${pid}` };
    }
  }
  const statusPath = path7.join(sessionDir, "status.json");
  const status = await readJsonFile2(statusPath) ?? {};
  status.state = "stopped";
  status.updated_at = (/* @__PURE__ */ new Date()).toISOString();
  if (existsSync5(sessionDir)) {
    await writeJsonFile(statusPath, status);
  }
  delete active[sessionId];
  const activePath = path7.join(homeDir, ".aloop", "active.json");
  await writeJsonFile(activePath, active);
  const historyPath = path7.join(homeDir, ".aloop", "history.json");
  const history = await readJsonFile2(historyPath) ?? [];
  history.push({
    session_id: sessionId,
    work_dir: entry.work_dir ?? null,
    started_at: entry.started_at ?? null,
    ended_at: status.updated_at,
    state: "stopped",
    iterations: status.iteration ?? null,
    provider: entry.provider ?? status.provider ?? null,
    mode: entry.mode ?? null,
    pid
  });
  await writeJsonFile(historyPath, history);
  return { success: true };
}

// src/commands/session.ts
var resolveHomeDir2 = resolveHomeDir;
var readActiveSessions2 = readActiveSessions;
var readProviderHealth2 = readProviderHealth;
var listActiveSessions2 = listActiveSessions;
var stopSession2 = stopSession;

// src/commands/status.ts
var WATCH_INTERVAL_MS = 2e3;
function formatRelativeTime(isoString) {
  if (!isoString)
    return "unknown";
  const diffMs = Date.now() - new Date(isoString).getTime();
  if (diffMs < 0)
    return "just now";
  const secs = Math.floor(diffMs / 1e3);
  if (secs < 60)
    return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60)
    return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}
function formatHealthLine(provider, health) {
  const status = health.status ?? "unknown";
  let detail = "";
  if (status === "cooldown" && health.cooldown_until) {
    const resumeMs = new Date(health.cooldown_until).getTime() - Date.now();
    if (resumeMs > 0) {
      const mins = Math.ceil(resumeMs / 6e4);
      const failures = health.consecutive_failures ?? 0;
      detail = `(${failures} failure${failures !== 1 ? "s" : ""}, resumes in ${mins}m)`;
    }
  } else if (status === "degraded" && health.failure_reason) {
    const hints = { auth: "auth error \u2014 run `gh auth login`" };
    detail = `(${hints[health.failure_reason] ?? health.failure_reason})`;
  } else if (status === "healthy" && health.last_success) {
    detail = `(last success: ${formatRelativeTime(health.last_success)})`;
  }
  return `  ${provider.padEnd(10)} ${status.padEnd(12)} ${detail}`.trimEnd();
}
function renderStatus(sessions, health) {
  const lines = [];
  if (sessions.length === 0) {
    lines.push("No active sessions.");
  } else {
    lines.push("Active Sessions:");
    for (const s of sessions) {
      const age = formatRelativeTime(s.started_at);
      const iter = s.iteration != null ? `iter ${s.iteration}` : "";
      const phase = s.phase ?? "";
      const detail = [iter, phase].filter(Boolean).join(", ");
      lines.push(`  ${s.session_id}  pid=${s.pid ?? "n/a"}  ${s.state}  ${detail}  (${age})`);
      if (s.work_dir)
        lines.push(`    workdir: ${s.work_dir}`);
    }
  }
  const healthEntries = Object.entries(health);
  if (healthEntries.length > 0) {
    lines.push("");
    lines.push("Provider Health:");
    for (const [provider, data] of healthEntries) {
      lines.push(formatHealthLine(provider, data));
    }
  }
  return lines.join("\n");
}
async function fetchAndRender(homeDir, outputMode) {
  const sessions = await listActiveSessions2(homeDir);
  const health = await readProviderHealth2(homeDir);
  if (outputMode === "json") {
    return JSON.stringify({ sessions, health }, null, 2);
  }
  return renderStatus(sessions, health);
}
async function statusCommand(options = {}) {
  const outputMode = options.output || "text";
  const homeDir = resolveHomeDir2(options.homeDir);
  if (!options.watch) {
    console.log(await fetchAndRender(homeDir, outputMode));
    return;
  }
  const render = async () => {
    const output = await fetchAndRender(homeDir, outputMode);
    process.stdout.write("\x1B[2J\x1B[H");
    const now = (/* @__PURE__ */ new Date()).toLocaleTimeString();
    process.stdout.write(`aloop status  (refreshing every ${WATCH_INTERVAL_MS / 1e3}s \u2014 ${now})

`);
    process.stdout.write(output + "\n");
  };
  await render();
  const timer = setInterval(render, WATCH_INTERVAL_MS);
  const cleanup = () => {
    clearInterval(timer);
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

// src/commands/active.ts
async function activeCommand(options = {}) {
  const outputMode = options.output || "text";
  const homeDir = resolveHomeDir2(options.homeDir);
  const sessions = await listActiveSessions2(homeDir);
  if (outputMode === "json") {
    console.log(JSON.stringify(sessions, null, 2));
    return;
  }
  if (sessions.length === 0) {
    console.log("No active sessions.");
    return;
  }
  for (const s of sessions) {
    const age = formatRelativeTime(s.started_at);
    console.log(`${s.session_id}  pid=${s.pid ?? "n/a"}  ${s.state}  ${s.work_dir ?? ""}  (${age})`);
  }
}

// src/commands/stop.ts
async function stopCommand(sessionId, options = {}) {
  const outputMode = options.output || "text";
  const homeDir = resolveHomeDir2(options.homeDir);
  const result = await stopSession2(homeDir, sessionId);
  if (outputMode === "json") {
    console.log(JSON.stringify(result, null, 2));
    if (!result.success)
      process.exit(1);
    return;
  }
  if (!result.success) {
    console.error(result.reason);
    process.exit(1);
  }
  console.log(`Session ${sessionId} stopped.`);
}

// src/commands/gh.ts
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs5 from "fs";
import * as path10 from "path";
import * as os4 from "os";

// src/commands/start.ts
import { spawn as spawn2, spawnSync as spawnSync5 } from "node:child_process";
import { cp, mkdir as mkdir4, readFile as readFile7, writeFile as writeFile7 } from "node:fs/promises";
import { existsSync as existsSync7 } from "node:fs";
import { createServer as createServer2 } from "node:net";
import path9 from "node:path";

// src/commands/compile-loop-plan.ts
import { readFile as readFile6, writeFile as writeFile6 } from "node:fs/promises";
import { existsSync as existsSync6 } from "node:fs";
import path8 from "node:path";
var defaultCompileDeps = {
  readFile: readFile6,
  writeFile: writeFile6,
  existsSync: existsSync6
};
var DEFAULT_AGENT_PROMPT = {
  plan: "PROMPT_plan.md",
  build: "PROMPT_build.md",
  proof: "PROMPT_proof.md",
  qa: "PROMPT_qa.md",
  review: "PROMPT_review.md",
  steer: "PROMPT_steer.md"
};
var DEFAULT_REASONING = {
  plan: "high",
  build: "medium",
  proof: "medium",
  qa: "medium",
  review: "high",
  steer: "medium"
};
async function getAgentConfig(agentName, projectRoot, deps) {
  const config = {
    prompt: DEFAULT_AGENT_PROMPT[agentName] ?? `PROMPT_${agentName}.md`,
    reasoning: DEFAULT_REASONING[agentName] ?? "medium"
  };
  if (projectRoot) {
    const agentYamlPath = path8.join(projectRoot, ".aloop", "agents", `${agentName}.yml`);
    if (deps.existsSync(agentYamlPath)) {
      try {
        const content = await deps.readFile(agentYamlPath, "utf8");
        const parsed = parseYaml(content);
        if (parsed.prompt) {
          config.prompt = parsed.prompt;
        }
        if (parsed.reasoning) {
          if (typeof parsed.reasoning === "string") {
            config.reasoning = parsed.reasoning;
          } else if (typeof parsed.reasoning === "object" && parsed.reasoning.effort) {
            config.reasoning = parsed.reasoning.effort;
          }
        }
        if (parsed.timeout != null) {
          config.timeout = String(parsed.timeout);
        }
        if (parsed.max_retries != null) {
          config.max_retries = String(parsed.max_retries);
        }
        if (parsed.retry_backoff != null) {
          config.retry_backoff = String(parsed.retry_backoff);
        }
      } catch (err) {
        console.error(`Error parsing agent config for ${agentName}:`, err);
      }
    }
  }
  return config;
}
async function buildCycleFromPipeline(projectRoot, deps) {
  const pipelineYamlPath = path8.join(projectRoot, ".aloop", "pipeline.yml");
  if (!deps.existsSync(pipelineYamlPath)) {
    return null;
  }
  try {
    const content = await deps.readFile(pipelineYamlPath, "utf8");
    const parsed = parseYaml(content);
    if (!parsed.pipeline || !Array.isArray(parsed.pipeline)) {
      return null;
    }
    const cycle = [];
    for (const step of parsed.pipeline) {
      const agentName = step.agent;
      if (!agentName)
        continue;
      const agentConfig = await getAgentConfig(agentName, projectRoot, deps);
      const repeat = typeof step.repeat === "number" ? step.repeat : 1;
      for (let i = 0; i < repeat; i++) {
        cycle.push({ filename: agentConfig.prompt, agent: agentName });
      }
    }
    return cycle.length > 0 ? cycle : null;
  } catch (err) {
    console.error("Error parsing pipeline.yml:", err);
    return null;
  }
}
async function buildCycleForMode(mode, projectRoot, deps) {
  const getEntry = async (name) => ({
    filename: (await getAgentConfig(name, projectRoot, deps)).prompt,
    agent: name
  });
  switch (mode) {
    case "plan":
      return [await getEntry("plan")];
    case "build":
      return [await getEntry("build")];
    case "review":
      return [await getEntry("review")];
    case "plan-build":
      return [await getEntry("plan"), await getEntry("build")];
    case "plan-build-review":
      return [
        await getEntry("plan"),
        await getEntry("build"),
        await getEntry("build"),
        await getEntry("build"),
        await getEntry("build"),
        await getEntry("build"),
        await getEntry("qa"),
        await getEntry("review")
      ];
  }
}
async function buildRoundRobinCycle(mode, roundRobinOrder, promptsDir, projectRoot, deps) {
  if (mode !== "plan-build-review" && mode !== "plan-build") {
    return buildCycleForMode(mode, projectRoot, deps);
  }
  const providers = roundRobinOrder.length > 0 ? roundRobinOrder : ["claude"];
  if (mode === "plan-build") {
    const planEntry = await (async () => {
      const config = await getAgentConfig("plan", projectRoot, deps);
      return { filename: config.prompt, agent: "plan" };
    })();
    const buildConfig = await getAgentConfig("build", projectRoot, deps);
    const agentPrefix = buildConfig.prompt.replace(/\.md$/, "");
    const cycle2 = [planEntry];
    for (const provider of providers) {
      const filename = `${agentPrefix}_${provider}.md`;
      cycle2.push({ filename, agent: "build" });
    }
    return cycle2;
  }
  if (projectRoot && mode === "plan-build-review") {
    const pipelineYamlPath = path8.join(projectRoot, ".aloop", "pipeline.yml");
    if (deps.existsSync(pipelineYamlPath)) {
      const content = await deps.readFile(pipelineYamlPath, "utf8");
      const parsed = parseYaml(content);
      if (parsed.pipeline && Array.isArray(parsed.pipeline)) {
        const cycle2 = [];
        for (const step of parsed.pipeline) {
          const agentName = step.agent;
          if (!agentName)
            continue;
          const agentConfig = await getAgentConfig(agentName, projectRoot, deps);
          const promptBase = agentConfig.prompt;
          if (agentName === "build") {
            const agentPrefix = promptBase.replace(/\.md$/, "");
            for (const provider of providers) {
              cycle2.push({ filename: `${agentPrefix}_${provider}.md`, agent: "build" });
            }
          } else {
            cycle2.push({ filename: promptBase, agent: agentName });
          }
        }
        return cycle2;
      }
    }
  }
  const cycle = [{ filename: "PROMPT_plan.md", agent: "plan" }];
  for (const provider of providers) {
    const filename = `PROMPT_build_${provider}.md`;
    cycle.push({ filename, agent: "build" });
  }
  cycle.push(
    { filename: "PROMPT_qa.md", agent: "qa" },
    { filename: "PROMPT_review.md", agent: "review" }
  );
  return cycle;
}
function extractProviderSuffixFromFilename(filename, roundRobinOrder) {
  const match = filename.match(/^PROMPT_[a-z]+_([a-z]+)\.md$/);
  if (match && roundRobinOrder.includes(match[1]))
    return match[1];
  const customMatch = filename.match(/_([a-z]+)\.md$/);
  if (customMatch && roundRobinOrder.includes(customMatch[1]))
    return customMatch[1];
  return null;
}
function buildFrontmatter(agent, provider, model, reasoning, opts) {
  const lines = ["---"];
  lines.push(`agent: ${agent}`);
  lines.push(`provider: ${provider}`);
  if (model) {
    lines.push(`model: ${model}`);
  }
  lines.push(`reasoning: ${reasoning}`);
  if (opts?.timeout) {
    lines.push(`timeout: ${opts.timeout}`);
  }
  if (opts?.max_retries) {
    lines.push(`max_retries: ${opts.max_retries}`);
  }
  if (opts?.retry_backoff) {
    lines.push(`retry_backoff: ${opts.retry_backoff}`);
  }
  lines.push("---");
  return lines.join("\n");
}
function prependFrontmatter(content, frontmatter) {
  if (content.startsWith("---\n") || content.startsWith("---\r\n")) {
    const endIndex = content.indexOf("\n---", 3);
    if (endIndex !== -1) {
      const afterFrontmatter = content.slice(endIndex + 4).replace(/^\r?\n/, "");
      return `${frontmatter}

${afterFrontmatter}`;
    }
  }
  return `${frontmatter}

${content}`;
}
async function compileLoopPlan(options, deps = defaultCompileDeps) {
  const { mode, provider, promptsDir, sessionDir, enabledProviders, roundRobinOrder, models, projectRoot } = options;
  const isRoundRobin = provider === "round-robin";
  let cycleEntries;
  if (isRoundRobin) {
    cycleEntries = await buildRoundRobinCycle(mode, roundRobinOrder, promptsDir, projectRoot, deps);
  } else if (mode === "plan-build-review" && projectRoot) {
    cycleEntries = await buildCycleFromPipeline(projectRoot, deps) ?? await buildCycleForMode(mode, projectRoot, deps);
  } else {
    cycleEntries = await buildCycleForMode(mode, projectRoot, deps);
  }
  const cycle = cycleEntries.map((e) => e.filename);
  const processed = /* @__PURE__ */ new Set();
  for (const entry of cycleEntries) {
    const { filename, agent } = entry;
    if (processed.has(filename))
      continue;
    processed.add(filename);
    const providerSuffix = extractProviderSuffixFromFilename(filename, roundRobinOrder);
    let promptProvider;
    let promptModel;
    if (providerSuffix) {
      promptProvider = providerSuffix;
      promptModel = models[providerSuffix] ?? "";
    } else {
      promptProvider = isRoundRobin ? roundRobinOrder[0] ?? "claude" : provider;
      promptModel = models[promptProvider] ?? "";
    }
    const agentConfig = await getAgentConfig(agent, projectRoot, deps);
    const reasoning = agentConfig.reasoning;
    const frontmatter = buildFrontmatter(agent, promptProvider, promptModel, reasoning, {
      timeout: agentConfig.timeout,
      max_retries: agentConfig.max_retries,
      retry_backoff: agentConfig.retry_backoff
    });
    const filePath = path8.join(promptsDir, filename);
    if (providerSuffix) {
      const baseFilename = agentConfig.prompt;
      const basePath = path8.join(promptsDir, baseFilename);
      if (deps.existsSync(basePath)) {
        const baseContent = await deps.readFile(basePath, "utf8");
        await deps.writeFile(filePath, prependFrontmatter(baseContent, frontmatter), "utf8");
      }
    } else if (deps.existsSync(filePath)) {
      const content = await deps.readFile(filePath, "utf8");
      await deps.writeFile(filePath, prependFrontmatter(content, frontmatter), "utf8");
    }
  }
  const plan = {
    cycle,
    cyclePosition: 0,
    iteration: 1,
    version: 1
  };
  const planPath = path8.join(sessionDir, "loop-plan.json");
  await deps.writeFile(planPath, `${JSON.stringify(plan, null, 2)}
`, "utf8");
  return plan;
}

// src/commands/start.ts
var LAUNCH_MODE_SET = /* @__PURE__ */ new Set(["start", "restart", "resume"]);
var PROVIDER_SET = /* @__PURE__ */ new Set(["claude", "codex", "gemini", "copilot", "round-robin"]);
var MODEL_PROVIDER_SET = /* @__PURE__ */ new Set(["claude", "codex", "gemini", "copilot"]);
var LOOP_MODE_SET = /* @__PURE__ */ new Set(["plan", "build", "review", "plan-build", "plan-build-review"]);
var DEFAULT_MODELS = {
  claude: "opus",
  codex: "gpt-5.3-codex",
  gemini: "gemini-3.1-pro-preview",
  copilot: "gpt-5.3-codex"
};
var defaultDeps = {
  discoverWorkspace: discoverWorkspace2,
  readFile: readFile7,
  writeFile: writeFile7,
  mkdir: mkdir4,
  cp,
  existsSync: existsSync7,
  spawn: spawn2,
  spawnSync: spawnSync5,
  platform: process.platform,
  env: process.env,
  now: () => /* @__PURE__ */ new Date(),
  nodePath: process.execPath,
  aloopPath: path9.resolve(process.argv[1])
};
function isStartDeps(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value;
  return typeof candidate.discoverWorkspace === "function" && typeof candidate.readFile === "function" && typeof candidate.writeFile === "function" && typeof candidate.mkdir === "function" && typeof candidate.cp === "function" && typeof candidate.existsSync === "function" && typeof candidate.spawn === "function" && typeof candidate.spawnSync === "function";
}
function resolveStartDeps(depsOrCommand, fallback = defaultDeps) {
  return isStartDeps(depsOrCommand) ? depsOrCommand : fallback;
}
function stripInlineComment2(raw) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (char === "#" && !inSingle && !inDouble) {
      const prev = i > 0 ? raw[i - 1] : " ";
      if (prev === " " || prev === "	") {
        return raw.slice(0, i).trimEnd();
      }
    }
  }
  return raw.trimEnd();
}
function parseYamlScalar2(raw) {
  const cleaned = stripInlineComment2(raw).trim();
  if (cleaned === "")
    return "";
  if (/^null$/i.test(cleaned))
    return null;
  if (/^true$/i.test(cleaned))
    return true;
  if (/^false$/i.test(cleaned))
    return false;
  if (/^-?\d+$/.test(cleaned))
    return Number.parseInt(cleaned, 10);
  if (cleaned.startsWith("'") && cleaned.endsWith("'") && cleaned.length >= 2) {
    return cleaned.slice(1, -1).replace(/''/g, "'");
  }
  if (cleaned.startsWith('"') && cleaned.endsWith('"') && cleaned.length >= 2) {
    return cleaned.slice(1, -1).replace(/\\"/g, '"');
  }
  return cleaned;
}
function parseAloopConfig(content) {
  const parsed = {
    values: {},
    enabled_providers: [],
    round_robin_order: [],
    models: {},
    retry_models: {},
    on_start: {}
  };
  const listSections = /* @__PURE__ */ new Set(["enabled_providers", "round_robin_order"]);
  const mapSections = /* @__PURE__ */ new Set(["models", "retry_models", "on_start"]);
  let activeSection = null;
  let inBlockScalar = false;
  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }
    const indent = rawLine.length - rawLine.trimStart().length;
    if (inBlockScalar) {
      if (indent > 0) {
        continue;
      }
      inBlockScalar = false;
      activeSection = null;
    }
    if (indent === 0) {
      const topLevel = trimmed.match(/^([A-Za-z0-9_]+):(?:\s*(.*))?$/);
      if (!topLevel) {
        activeSection = null;
        continue;
      }
      const key = topLevel[1];
      const rawValue = topLevel[2] ?? "";
      if (rawValue === "") {
        activeSection = key;
        continue;
      }
      if (rawValue === "|" || rawValue === ">") {
        inBlockScalar = true;
        activeSection = null;
        continue;
      }
      parsed.values[key] = parseYamlScalar2(rawValue);
      activeSection = null;
      continue;
    }
    if (!activeSection || indent < 2) {
      continue;
    }
    if (listSections.has(activeSection)) {
      const listMatch = trimmed.match(/^-\s+(.+)$/);
      if (!listMatch) {
        continue;
      }
      const value = parseYamlScalar2(listMatch[1]);
      if (typeof value === "string" && value.length > 0) {
        if (activeSection === "enabled_providers") {
          parsed.enabled_providers.push(value);
        } else if (activeSection === "round_robin_order") {
          parsed.round_robin_order.push(value);
        }
      }
      continue;
    }
    if (mapSections.has(activeSection)) {
      const mapMatch = trimmed.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
      if (!mapMatch) {
        continue;
      }
      const mapKey = mapMatch[1];
      const mapValue = parseYamlScalar2(mapMatch[2]);
      if (activeSection === "models") {
        if (typeof mapValue === "string" && mapValue.length > 0) {
          parsed.models[mapKey] = mapValue;
        }
      } else if (activeSection === "retry_models") {
        if (mapValue === null) {
          parsed.retry_models[mapKey] = null;
        } else if (typeof mapValue === "string" && mapValue.length > 0) {
          parsed.retry_models[mapKey] = mapValue;
        }
      } else if (activeSection === "on_start") {
        if (mapKey === "monitor" && typeof mapValue === "string" && mapValue.length > 0) {
          parsed.on_start.monitor = mapValue;
        } else if (mapKey === "auto_open" && typeof mapValue === "boolean") {
          parsed.on_start.auto_open = mapValue;
        }
      }
    }
  }
  return parsed;
}
function emptyParsedConfig() {
  return {
    values: {},
    enabled_providers: [],
    round_robin_order: [],
    models: {},
    retry_models: {},
    on_start: {}
  };
}
async function readOptionalConfig(configPath, deps) {
  if (!deps.existsSync(configPath))
    return null;
  const content = await deps.readFile(configPath, "utf8");
  return parseAloopConfig(content);
}
function toPositiveInt(value) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number.parseInt(value, 10);
    return parsed > 0 ? parsed : null;
  }
  return null;
}
function toBoolean(value, fallback) {
  if (typeof value === "boolean")
    return value;
  if (typeof value === "string") {
    if (/^true$/i.test(value))
      return true;
    if (/^false$/i.test(value))
      return false;
  }
  return fallback;
}
function normalizeProviderList(values) {
  const normalized = [];
  for (const raw of values) {
    const candidate = raw.trim().toLowerCase();
    if (!MODEL_PROVIDER_SET.has(candidate)) {
      continue;
    }
    const provider = candidate;
    if (!normalized.includes(provider)) {
      normalized.push(provider);
    }
  }
  return normalized;
}
function sanitizeSessionToken(value) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : "session";
}
function padNumber(value) {
  return value.toString().padStart(2, "0");
}
function formatSessionTimestamp(date) {
  return `${date.getUTCFullYear()}${padNumber(date.getUTCMonth() + 1)}${padNumber(date.getUTCDate())}-${padNumber(date.getUTCHours())}${padNumber(date.getUTCMinutes())}${padNumber(date.getUTCSeconds())}`;
}
function resolveModeFromFlags(options) {
  const modeFlags = [options.plan, options.build, options.review].filter(Boolean).length;
  if (modeFlags > 1) {
    throw new Error("Choose at most one of --plan, --build, or --review.");
  }
  if (options.plan)
    return "plan";
  if (options.build)
    return "build";
  if (options.review)
    return "review";
  return null;
}
function assertLoopMode(value) {
  const normalized = value.trim().toLowerCase();
  if (!LOOP_MODE_SET.has(normalized)) {
    throw new Error(`Invalid mode: ${value}`);
  }
  return normalized;
}
function resolveConfiguredStartMode(value) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "loop") {
    return "plan-build-review";
  }
  if (normalized === "orchestrate") {
    throw new Error("Invalid mode: orchestrate (use `aloop orchestrate` for orchestrator sessions).");
  }
  return assertLoopMode(value);
}
function assertLaunchMode(value) {
  const normalized = value.trim().toLowerCase();
  if (!LAUNCH_MODE_SET.has(normalized)) {
    throw new Error(`Invalid launch mode: ${value} (must be start, restart, or resume)`);
  }
  return normalized;
}
function assertLoopProvider(value) {
  const normalized = value.trim().toLowerCase();
  if (!PROVIDER_SET.has(normalized)) {
    throw new Error(`Invalid provider: ${value}`);
  }
  return normalized;
}
function trySpawnSync(deps, command, args) {
  try {
    const result = deps.spawnSync(command, args, { encoding: "utf8", stdio: "ignore", windowsHide: true });
    return result.status;
  } catch {
    return null;
  }
}
function resolvePowerShellBinary(deps) {
  for (const candidate of ["pwsh", "powershell"]) {
    if (trySpawnSync(deps, candidate, ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.Major"]) === 0) {
      return candidate;
    }
  }
  throw new Error("PowerShell is required to launch loop.ps1 but neither pwsh nor powershell was found.");
}
function normalizeGitBashPathForWindows(value) {
  const match = value.match(/^[\\/](?![\\/])([a-zA-Z])(?:[\\/](.*))?$/);
  if (!match) {
    return value;
  }
  const drive = match[1].toUpperCase();
  const tail = (match[2] ?? "").replace(/[\\/]+/g, "\\");
  return tail.length > 0 ? `${drive}:\\${tail}` : `${drive}:\\`;
}
async function readSessionMeta(sessionDir, deps) {
  const metaPath = path9.join(sessionDir, "meta.json");
  if (!deps.existsSync(metaPath))
    return null;
  try {
    const content = await deps.readFile(metaPath, "utf8");
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== "object" || !parsed.session_id)
      return null;
    return parsed;
  } catch {
    return null;
  }
}
async function readActiveMap(activePath, deps) {
  if (!deps.existsSync(activePath)) {
    return {};
  }
  try {
    const content = await deps.readFile(activePath, "utf8");
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}
function resolveSessionId(baseName, sessionsRoot, deps) {
  const now = deps.now();
  const baseSessionId = `${sanitizeSessionToken(baseName)}-${formatSessionTimestamp(now)}`;
  let sessionId = baseSessionId;
  let suffix = 1;
  while (deps.existsSync(path9.join(sessionsRoot, sessionId))) {
    sessionId = `${baseSessionId}-${suffix}`;
    suffix += 1;
  }
  return sessionId;
}
function selectValue(...values) {
  for (const value of values) {
    if (value !== void 0 && value !== null) {
      return value;
    }
  }
  return void 0;
}
function collectModelProviders(enabledProviders, provider) {
  const set = new Set(enabledProviders);
  if (provider !== "round-robin") {
    set.add(provider);
  }
  return Array.from(set);
}
function createGitFailureWarning(stderr, stdout) {
  const detail = [stderr, stdout].map((value) => value.trim()).filter(Boolean).join(" | ");
  if (!detail) {
    return "git worktree add failed; falling back to in-place execution.";
  }
  return `git worktree add failed (${detail}); falling back to in-place execution.`;
}
function normalizeMonitorMode(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "dashboard" || normalized === "terminal" || normalized === "none") {
    return normalized;
  }
  return null;
}
function quotePowerShellSingle(value) {
  return `'${value.replace(/'/g, "''")}'`;
}
function resolveOnStartBehavior(projectConfig, globalConfig) {
  const monitor = normalizeMonitorMode(selectValue(projectConfig.on_start.monitor, globalConfig.on_start.monitor)) ?? "dashboard";
  const autoOpen = toBoolean(selectValue(projectConfig.on_start.auto_open, globalConfig.on_start.auto_open), true);
  return { mode: monitor, autoOpen };
}
function runShortCommand(deps, command, args, cwd) {
  try {
    const result = deps.spawnSync(command, args, { cwd, encoding: "utf8", stdio: "ignore", windowsHide: true });
    if (result.status === 0) {
      return { ok: true, message: null };
    }
    return { ok: false, message: `exit code ${result.status ?? "unknown"}` };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}
function spawnDetached(deps, command, args, cwd) {
  try {
    const child = deps.spawn(command, args, {
      cwd,
      detached: true,
      stdio: "ignore",
      env: { ...deps.env },
      windowsHide: true
    });
    child.unref();
    return child.pid ?? null;
  } catch {
    return null;
  }
}
function openInBrowser(deps, url, cwd) {
  if (deps.platform === "win32") {
    const powerShell = resolvePowerShellBinary(deps);
    return runShortCommand(deps, powerShell, ["-NoProfile", "-Command", `Start-Process ${quotePowerShellSingle(url)}`], cwd);
  }
  if (deps.platform === "darwin") {
    return runShortCommand(deps, "open", [url], cwd);
  }
  return runShortCommand(deps, "xdg-open", [url], cwd);
}
function openStatusTerminal(deps, homeDir, cwd) {
  const statusCommand2 = `"${deps.nodePath}" "${deps.aloopPath}" status --watch --home-dir "${homeDir.replace(/"/g, '\\"')}"`;
  if (deps.platform === "win32") {
    const powerShell = resolvePowerShellBinary(deps);
    const terminalShell = trySpawnSync(deps, "pwsh", ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.Major"]) === 0 ? "pwsh" : "powershell";
    const launchCommand = `Start-Process ${quotePowerShellSingle(terminalShell)} -ArgumentList @('-NoExit','-Command',${quotePowerShellSingle(statusCommand2)})`;
    return runShortCommand(deps, powerShell, ["-NoProfile", "-Command", launchCommand], cwd);
  }
  if (deps.platform === "darwin") {
    const escapedStatus = statusCommand2.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return runShortCommand(
      deps,
      "osascript",
      ["-e", `tell application "Terminal" to do script "${escapedStatus}"`],
      cwd
    );
  }
  return runShortCommand(deps, "x-terminal-emulator", ["-e", statusCommand2], cwd);
}
async function reserveLocalPort() {
  return new Promise((resolve2, reject) => {
    const server = createServer2();
    server.unref();
    server.once("error", (error) => reject(error));
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Failed to reserve dashboard port."));
        return;
      }
      const reservedPort = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve2(reservedPort);
      });
    });
  });
}
async function startCommandWithDeps(options = {}, deps = defaultDeps) {
  const homeDir = resolveHomeDir2(options.homeDir);
  const discovery = await deps.discoverWorkspace({ projectRoot: options.projectRoot, homeDir: options.homeDir });
  const aloopRoot = path9.join(homeDir, ".aloop");
  const globalConfigPath = path9.join(aloopRoot, "config.yml");
  const hasProjectConfig = discovery.setup.config_exists && deps.existsSync(discovery.setup.config_path);
  const hasGlobalConfig = deps.existsSync(globalConfigPath);
  if (!hasProjectConfig && !hasGlobalConfig) {
    throw new Error("No Aloop configuration found for this project. Run `aloop setup` first.");
  }
  const sessionsRoot = path9.join(aloopRoot, "sessions");
  const warnings = [];
  await deps.mkdir(sessionsRoot, { recursive: true });
  const versionJsonPath = path9.join(aloopRoot, "version.json");
  try {
    const versionRaw = await deps.readFile(versionJsonPath, "utf8");
    const versionData = JSON.parse(versionRaw);
    if (versionData.commit && discovery.project.is_git_repo) {
      const headResult = deps.spawnSync("git", ["-C", discovery.project.root, "rev-parse", "--short", "HEAD"], { encoding: "utf8" });
      if (headResult.status === 0) {
        const currentCommit = headResult.stdout.trim();
        if (currentCommit && currentCommit !== versionData.commit) {
          warnings.push(
            `Installed runtime (commit ${versionData.commit}, installed ${versionData.installed_at ?? "unknown"}) may be stale \u2014 current repo HEAD is ${currentCommit}. Run \`aloop update\` to refresh.`
          );
        }
      }
    }
  } catch {
  }
  const projectConfig = await readOptionalConfig(discovery.setup.config_path, deps) ?? emptyParsedConfig();
  const globalConfig = await readOptionalConfig(path9.join(aloopRoot, "config.yml"), deps) ?? emptyParsedConfig();
  const enabledProviders = normalizeProviderList(
    projectConfig.enabled_providers.length > 0 ? projectConfig.enabled_providers : globalConfig.enabled_providers.length > 0 ? globalConfig.enabled_providers : discovery.providers.installed
  );
  if (enabledProviders.length === 0) {
    enabledProviders.push("claude");
  }
  const forcedMode = resolveModeFromFlags(options);
  const resolvedMode = forcedMode ?? (options.mode ? resolveConfiguredStartMode(options.mode) : null) ?? resolveConfiguredStartMode(String(selectValue(projectConfig.values.mode, globalConfig.values.default_mode, "plan-build-review")));
  const launchMode = options.launch ? assertLaunchMode(options.launch) : "start";
  const selectedProvider = options.provider ? assertLoopProvider(options.provider) : assertLoopProvider(String(selectValue(projectConfig.values.provider, globalConfig.values.default_provider, discovery.providers.default_provider, "claude")));
  if (selectedProvider !== "round-robin" && !enabledProviders.includes(selectedProvider)) {
    enabledProviders.push(selectedProvider);
  }
  const roundRobinOrderSource = projectConfig.round_robin_order.length > 0 ? projectConfig.round_robin_order : globalConfig.round_robin_order;
  let roundRobinOrder = normalizeProviderList(roundRobinOrderSource);
  if (roundRobinOrder.length === 0) {
    roundRobinOrder = [...enabledProviders];
  }
  roundRobinOrder = roundRobinOrder.filter((provider) => enabledProviders.includes(provider));
  if (roundRobinOrder.length === 0) {
    roundRobinOrder = [...enabledProviders];
  }
  const maxIterations = toPositiveInt(selectValue(options.maxIterations, projectConfig.values.max_iterations, globalConfig.values.max_iterations)) ?? 50;
  const maxStuck = toPositiveInt(selectValue(projectConfig.values.max_stuck, globalConfig.values.max_stuck)) ?? 3;
  const backupEnabled = toBoolean(selectValue(projectConfig.values.backup_enabled, globalConfig.values.backup_enabled), false);
  const worktreeDefault = toBoolean(selectValue(projectConfig.values.worktree_default, globalConfig.values.worktree_default), true);
  const onStartBehavior = resolveOnStartBehavior(projectConfig, globalConfig);
  const mergedModels = {
    ...DEFAULT_MODELS,
    ...Object.fromEntries(
      Object.entries(globalConfig.models).filter(([provider]) => MODEL_PROVIDER_SET.has(provider))
    ),
    ...Object.fromEntries(
      Object.entries(projectConfig.models).filter(([provider]) => MODEL_PROVIDER_SET.has(provider))
    )
  };
  const copilotRetryModel = String(selectValue(projectConfig.retry_models.copilot, globalConfig.retry_models.copilot, "claude-sonnet-4.6") ?? "claude-sonnet-4.6");
  const startedAt = deps.now().toISOString();
  let sessionId;
  let sessionDir;
  let promptsDir;
  let workDir = discovery.project.root;
  let worktreePath = null;
  let branchName = null;
  let useWorktree = !options.inPlace && worktreeDefault;
  if (launchMode === "resume" && options.sessionId) {
    sessionId = options.sessionId;
    sessionDir = path9.join(sessionsRoot, sessionId);
    if (!deps.existsSync(sessionDir)) {
      throw new Error(`Session not found: ${sessionId}. Cannot resume a non-existent session.`);
    }
    const existingMeta = await readSessionMeta(sessionDir, deps);
    if (!existingMeta) {
      throw new Error(`Session meta.json not found or invalid for session: ${sessionId}.`);
    }
    promptsDir = existingMeta.prompts_dir ?? path9.join(sessionDir, "prompts");
    branchName = existingMeta.branch ?? null;
    if (existingMeta.worktree && existingMeta.worktree_path) {
      if (deps.existsSync(existingMeta.worktree_path)) {
        worktreePath = existingMeta.worktree_path;
        workDir = existingMeta.worktree_path;
        useWorktree = true;
      } else if (branchName && discovery.project.is_git_repo) {
        const candidatePath = existingMeta.worktree_path;
        const worktreeResult = deps.spawnSync("git", ["-C", discovery.project.root, "worktree", "add", candidatePath, branchName], { encoding: "utf8" });
        if (worktreeResult.status === 0) {
          worktreePath = candidatePath;
          workDir = candidatePath;
          useWorktree = true;
        } else {
          warnings.push(createGitFailureWarning(String(worktreeResult.stderr ?? ""), String(worktreeResult.stdout ?? "")));
          useWorktree = false;
        }
      } else {
        warnings.push("Original worktree was removed and branch is unavailable; resuming in-place.");
        useWorktree = false;
      }
    } else {
      workDir = existingMeta.work_dir ?? discovery.project.root;
      useWorktree = false;
    }
  } else {
    sessionId = resolveSessionId(discovery.project.name, sessionsRoot, deps);
    sessionDir = path9.join(sessionsRoot, sessionId);
    const promptsSourceDir = path9.join(discovery.setup.project_dir, "prompts");
    promptsDir = path9.join(sessionDir, "prompts");
    await deps.mkdir(sessionDir, { recursive: true });
    if (!deps.existsSync(promptsSourceDir)) {
      throw new Error(`Project prompts not found: ${promptsSourceDir}. Run \`aloop setup\` first.`);
    }
    await deps.cp(promptsSourceDir, promptsDir, { recursive: true });
    if (useWorktree) {
      if (!discovery.project.is_git_repo) {
        warnings.push("Worktree requested but project is not a git repository; using in-place execution.");
        useWorktree = false;
      } else {
        const candidatePath = path9.join(sessionDir, "worktree");
        const candidateBranch = `aloop/${sessionId}`;
        const worktreeResult = deps.spawnSync("git", ["-C", discovery.project.root, "worktree", "add", candidatePath, "-b", candidateBranch], { encoding: "utf8" });
        if (worktreeResult.status !== 0) {
          warnings.push(createGitFailureWarning(String(worktreeResult.stderr ?? ""), String(worktreeResult.stdout ?? "")));
          useWorktree = false;
        } else {
          worktreePath = candidatePath;
          workDir = candidatePath;
          branchName = candidateBranch;
        }
      }
    }
  }
  await compileLoopPlan({
    mode: resolvedMode,
    provider: selectedProvider,
    promptsDir,
    sessionDir,
    enabledProviders,
    roundRobinOrder,
    models: mergedModels,
    projectRoot: discovery.project.root
  }, {
    readFile: (p, enc) => deps.readFile(p, enc),
    writeFile: (p, data, enc) => deps.writeFile(p, data, enc),
    existsSync: deps.existsSync
  });
  const modelProviders = collectModelProviders(enabledProviders, selectedProvider);
  const roundRobinCsv = roundRobinOrder.join(",");
  const loopBinDir = path9.join(aloopRoot, "bin");
  const launchWorkDir = deps.platform === "win32" ? normalizeGitBashPathForWindows(workDir) : workDir;
  let command;
  let args;
  if (deps.platform === "win32") {
    const loopScript = normalizeGitBashPathForWindows(path9.join(loopBinDir, "loop.ps1"));
    if (!deps.existsSync(loopScript)) {
      throw new Error(`Loop script not found: ${loopScript}`);
    }
    const promptsDirForPowerShell = normalizeGitBashPathForWindows(promptsDir);
    const sessionDirForPowerShell = normalizeGitBashPathForWindows(sessionDir);
    const workDirForPowerShell = normalizeGitBashPathForWindows(workDir);
    command = resolvePowerShellBinary(deps);
    args = [
      "-NoProfile",
      "-File",
      loopScript,
      "-PromptsDir",
      promptsDirForPowerShell,
      "-SessionDir",
      sessionDirForPowerShell,
      "-WorkDir",
      workDirForPowerShell,
      "-Mode",
      resolvedMode,
      "-Provider",
      selectedProvider,
      "-RoundRobinProviders",
      roundRobinCsv,
      "-MaxIterations",
      String(maxIterations),
      "-MaxStuck",
      String(maxStuck),
      "-LaunchMode",
      launchMode
    ];
    if (backupEnabled) {
      args.push("-BackupEnabled");
    }
    for (const provider of modelProviders) {
      const model = mergedModels[provider];
      if (!model)
        continue;
      if (provider === "claude")
        args.push("-ClaudeModel", model);
      if (provider === "codex")
        args.push("-CodexModel", model);
      if (provider === "gemini")
        args.push("-GeminiModel", model);
      if (provider === "copilot") {
        args.push("-CopilotModel", model);
      }
    }
    if (modelProviders.includes("copilot") && copilotRetryModel.length > 0) {
      args.push("-CopilotRetryModel", copilotRetryModel);
    }
  } else {
    const loopScript = path9.join(loopBinDir, "loop.sh");
    if (!deps.existsSync(loopScript)) {
      throw new Error(`Loop script not found: ${loopScript}`);
    }
    command = loopScript;
    args = [
      "--prompts-dir",
      promptsDir,
      "--session-dir",
      sessionDir,
      "--work-dir",
      workDir,
      "--mode",
      resolvedMode,
      "--provider",
      selectedProvider,
      "--round-robin",
      roundRobinCsv,
      "--max-iterations",
      String(maxIterations),
      "--max-stuck",
      String(maxStuck),
      "--launch-mode",
      launchMode
    ];
    if (backupEnabled) {
      args.push("--backup");
    }
    for (const provider of modelProviders) {
      const model = mergedModels[provider];
      if (!model)
        continue;
      if (provider === "claude")
        args.push("--claude-model", model);
      if (provider === "codex")
        args.push("--codex-model", model);
      if (provider === "gemini")
        args.push("--gemini-model", model);
      if (provider === "copilot")
        args.push("--copilot-model", model);
    }
  }
  const metaPath = path9.join(sessionDir, "meta.json");
  const statusPath = path9.join(sessionDir, "status.json");
  const meta = {
    session_id: sessionId,
    project_name: discovery.project.name,
    project_root: discovery.project.root,
    project_hash: discovery.project.hash,
    provider: selectedProvider,
    mode: resolvedMode,
    launch_mode: launchMode,
    max_iterations: maxIterations,
    max_stuck: maxStuck,
    worktree: useWorktree,
    worktree_path: worktreePath,
    work_dir: workDir,
    branch: branchName,
    prompts_dir: promptsDir,
    session_dir: sessionDir,
    enabled_providers: enabledProviders,
    round_robin_order: roundRobinOrder,
    warnings,
    created_at: startedAt
  };
  await deps.writeFile(metaPath, `${JSON.stringify(meta, null, 2)}
`, "utf8");
  await deps.writeFile(
    statusPath,
    `${JSON.stringify({ state: "starting", mode: resolvedMode, provider: selectedProvider, iteration: 0, updated_at: startedAt }, null, 2)}
`,
    "utf8"
  );
  const child = deps.spawn(command, args, {
    cwd: launchWorkDir,
    detached: true,
    stdio: "ignore",
    env: { ...deps.env },
    windowsHide: true
  });
  child.unref();
  const pid = child.pid;
  if (!pid) {
    throw new Error("Failed to launch loop process.");
  }
  meta.pid = pid;
  meta.started_at = startedAt;
  await deps.writeFile(metaPath, `${JSON.stringify(meta, null, 2)}
`, "utf8");
  const activePath = path9.join(aloopRoot, "active.json");
  let registered = false;
  try {
    const active = await readActiveMap(activePath, deps);
    active[sessionId] = {
      session_id: sessionId,
      session_dir: sessionDir,
      project_name: discovery.project.name,
      project_root: discovery.project.root,
      pid,
      work_dir: workDir,
      started_at: startedAt,
      provider: selectedProvider,
      mode: resolvedMode
    };
    await deps.writeFile(activePath, `${JSON.stringify(active, null, 2)}
`, "utf8");
    registered = true;
    let monitorPid = null;
    let dashboardUrl = null;
    if (onStartBehavior.mode === "dashboard") {
      let dashboardPort = null;
      try {
        dashboardPort = await reserveLocalPort();
      } catch (error) {
        warnings.push(`Failed to reserve a local dashboard port: ${error.message}`);
      }
      if (dashboardPort !== null) {
        dashboardUrl = `http://localhost:${dashboardPort}`;
        monitorPid = spawnDetached(
          deps,
          deps.nodePath,
          [deps.aloopPath, "dashboard", "--port", String(dashboardPort), "--session-dir", sessionDir, "--workdir", launchWorkDir],
          launchWorkDir
        );
        if (!monitorPid) {
          warnings.push("Failed to launch dashboard monitor automatically. You can run `aloop dashboard` manually.");
        } else if (onStartBehavior.autoOpen) {
          const opened = openInBrowser(deps, dashboardUrl, launchWorkDir);
          if (!opened.ok) {
            warnings.push(`Failed to auto-open dashboard URL (${opened.message ?? "unknown error"}); trying terminal monitor.`);
            const terminalLaunch = openStatusTerminal(deps, homeDir, launchWorkDir);
            if (!terminalLaunch.ok) {
              warnings.push(`Failed to open terminal monitor fallback (${terminalLaunch.message ?? "unknown error"}). Run \`aloop dashboard\` or \`aloop status --watch\` manually.`);
            }
          }
        }
      }
    } else if (onStartBehavior.mode === "terminal" && onStartBehavior.autoOpen) {
      const terminalLaunch = openStatusTerminal(deps, homeDir, launchWorkDir);
      if (!terminalLaunch.ok) {
        warnings.push(`Failed to launch terminal monitor (${terminalLaunch.message ?? "unknown error"}). Run \`aloop status --watch\` manually.`);
      }
    }
    meta.monitor_mode = onStartBehavior.mode;
    meta.monitor_auto_open = onStartBehavior.autoOpen;
    meta.monitor_pid = monitorPid;
    meta.dashboard_url = dashboardUrl;
    await deps.writeFile(metaPath, `${JSON.stringify(meta, null, 2)}
`, "utf8");
    return {
      session_id: sessionId,
      session_dir: sessionDir,
      prompts_dir: promptsDir,
      work_dir: workDir,
      worktree: useWorktree,
      worktree_path: worktreePath,
      branch: branchName,
      provider: selectedProvider,
      mode: resolvedMode,
      launch_mode: launchMode,
      max_iterations: maxIterations,
      max_stuck: maxStuck,
      pid,
      started_at: startedAt,
      monitor_mode: onStartBehavior.mode,
      monitor_auto_open: onStartBehavior.autoOpen,
      monitor_pid: monitorPid,
      dashboard_url: dashboardUrl,
      warnings
    };
  } catch (error) {
    if (registered) {
      try {
        const active = await readActiveMap(activePath, deps);
        delete active[sessionId];
        await deps.writeFile(activePath, `${JSON.stringify(active, null, 2)}
`, "utf8");
      } catch {
      }
    }
    throw error;
  }
}
async function startCommand(sessionIdArg, options = {}, depsOrCommand) {
  const deps = resolveStartDeps(depsOrCommand);
  if (sessionIdArg) {
    options.sessionId = sessionIdArg;
  }
  const outputMode = options.output ?? "text";
  const result = await startCommandWithDeps(options, deps);
  if (outputMode === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log("Aloop loop started!");
  console.log("");
  console.log(`  Session:  ${result.session_id}`);
  console.log(`  Mode:     ${result.mode}`);
  console.log(`  Launch:   ${result.launch_mode}`);
  console.log(`  Provider: ${result.provider}`);
  console.log(`  Work dir: ${result.work_dir}`);
  console.log(`  PID:      ${result.pid}`);
  console.log(`  Prompts:  ${result.prompts_dir}`);
  console.log(`  Monitor:  ${result.monitor_mode} (auto_open=${result.monitor_auto_open ? "true" : "false"})`);
  if (result.dashboard_url) {
    console.log(`  Dashboard: ${result.dashboard_url}`);
  }
  if (result.warnings.length > 0) {
    console.log("");
    console.log("Warnings:");
    for (const warning of result.warnings) {
      console.log(`  - ${warning}`);
    }
  }
}

// src/lib/ci-utils.ts
function normalizeCiDetailForSignature(detail) {
  return detail.toLowerCase().replace(/[0-9a-f]{7,40}/g, "<sha>").replace(/\d+/g, "<n>").replace(/\s+/g, " ").trim();
}

// src/lib/error-handling.ts
function withErrorHandling(action) {
  return async (...args) => {
    try {
      await action(...args);
    } catch (error) {
      if (error && typeof error === "object" && "stderr" in error && typeof error.stderr === "string" && error.stderr.trim()) {
        console.error(`Error: ${error.stderr.trim()}`);
      } else if (error instanceof Error) {
        console.error(`Error: ${error.message}`);
      } else {
        console.error(`Error: ${String(error)}`);
      }
      process.exit(1);
    }
  };
}

// src/commands/gh.ts
var execFileAsync = promisify(execFile);
var GH_PATH_HARDENING_BLOCK_MESSAGE = "blocked by aloop PATH hardening";
function extractErrorMessage(error) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return String(error);
}
function extractGhCliError(error) {
  if (error && typeof error === "object") {
    const maybeStderr = error.stderr;
    if (typeof maybeStderr === "string" && maybeStderr.trim()) {
      return maybeStderr.trim();
    }
  }
  return extractErrorMessage(error);
}
function isPathHardeningBlockedError(error) {
  const message = extractErrorMessage(error).toLowerCase();
  const stderr = extractGhCliError(error).toLowerCase();
  const needle = GH_PATH_HARDENING_BLOCK_MESSAGE.toLowerCase();
  return message.includes(needle) || stderr.includes(needle);
}
function getGhBinaryCandidateNames(platform) {
  if (platform === "win32") {
    return ["gh.exe", "gh.cmd", "gh.bat", "gh"];
  }
  return ["gh"];
}
function selectUsableGhBinary(pathValue, platform = process.platform) {
  if (!pathValue.trim()) {
    return null;
  }
  const candidates = getGhBinaryCandidateNames(platform);
  const pathEntries = pathValue.split(path10.delimiter).map((entry) => entry.trim()).filter(Boolean);
  for (const entry of pathEntries) {
    for (const candidateName of candidates) {
      const fullPath = path10.join(entry, candidateName);
      if (!fs5.existsSync(fullPath)) {
        continue;
      }
      const stats = fs5.statSync(fullPath);
      if (!stats.isFile()) {
        continue;
      }
      if (stats.size <= 1024) {
        try {
          const contents = fs5.readFileSync(fullPath, "utf8");
          if (contents.includes(GH_PATH_HARDENING_BLOCK_MESSAGE)) {
            continue;
          }
        } catch {
        }
      }
      return fullPath;
    }
  }
  return null;
}
var ghExecutor = {
  async exec(args) {
    try {
      return await execFileAsync("gh", args);
    } catch (error) {
      if (!isPathHardeningBlockedError(error)) {
        throw error;
      }
      const fallbackBinary = selectUsableGhBinary(process.env.PATH ?? "") ?? selectUsableGhBinary(process.env.ALOOP_ORIGINAL_PATH ?? "");
      if (!fallbackBinary) {
        throw error;
      }
      return execFileAsync(fallbackBinary, args);
    }
  }
};
var ghCommand = new Command("gh").description("Policy-enforced GitHub operations");
var defaultGhStartDeps = {
  startSession: (options) => startCommandWithDeps(options),
  execGh: (args) => ghExecutor.exec(args),
  execGit: (args) => execFileAsync("git", args),
  readFile: (filePath, encoding) => fs5.readFileSync(filePath, encoding),
  writeFile: (filePath, content) => fs5.writeFileSync(filePath, content, "utf8"),
  existsSync: (filePath) => fs5.existsSync(filePath),
  cwd: () => process.cwd()
};
var GH_WATCH_VERSION = 1;
var GH_WATCH_DEFAULT_LABEL = "aloop";
var GH_WATCH_DEFAULT_INTERVAL_SECONDS = 60;
var GH_WATCH_DEFAULT_MAX_CONCURRENT = 3;
var GH_FEEDBACK_DEFAULT_MAX_ITERATIONS = 5;
var GH_SAME_CI_FAILURE_LIMIT = 3;
var ghLoopRuntime = {
  listActiveSessions: async (homeDir) => listActiveSessions2(homeDir),
  stopSession: async (homeDir, sessionId) => stopSession2(homeDir, sessionId),
  startIssue: async (options) => ghStartCommandWithDeps(options),
  now: () => (/* @__PURE__ */ new Date()).toISOString()
};
function createEmptyWatchState() {
  return {
    version: GH_WATCH_VERSION,
    issues: {},
    queue: []
  };
}
function resolveAloopRoot(homeDir) {
  return path10.join(resolveHomeDir2(homeDir), ".aloop");
}
function getWatchStatePath(homeDir) {
  return path10.join(resolveAloopRoot(homeDir), "watch.json");
}
function normalizeWatchIssueEntry(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const candidate = value;
  const issueNumber = parsePositiveInteger(candidate.issue_number);
  if (!issueNumber) {
    return null;
  }
  const rawStatus = typeof candidate.status === "string" ? candidate.status : "";
  const status = rawStatus === "running" || rawStatus === "queued" || rawStatus === "completed" || rawStatus === "stopped" ? rawStatus : "queued";
  return {
    issue_number: issueNumber,
    session_id: typeof candidate.session_id === "string" && candidate.session_id.trim() ? candidate.session_id : null,
    branch: typeof candidate.branch === "string" && candidate.branch.trim() ? candidate.branch : null,
    repo: typeof candidate.repo === "string" && candidate.repo.trim() ? candidate.repo : null,
    pr_number: parsePositiveInteger(candidate.pr_number) ?? null,
    pr_url: typeof candidate.pr_url === "string" && candidate.pr_url.trim() ? candidate.pr_url : null,
    status,
    completion_state: typeof candidate.completion_state === "string" && candidate.completion_state.trim() ? candidate.completion_state : null,
    completion_finalized: candidate.completion_finalized === true,
    created_at: typeof candidate.created_at === "string" && candidate.created_at.trim() ? candidate.created_at : ghLoopRuntime.now(),
    updated_at: typeof candidate.updated_at === "string" && candidate.updated_at.trim() ? candidate.updated_at : ghLoopRuntime.now(),
    feedback_iteration: typeof candidate.feedback_iteration === "number" && Number.isInteger(candidate.feedback_iteration) && candidate.feedback_iteration >= 0 ? candidate.feedback_iteration : 0,
    max_feedback_iterations: parsePositiveInteger(candidate.max_feedback_iterations) ?? GH_FEEDBACK_DEFAULT_MAX_ITERATIONS,
    processed_comment_ids: extractPositiveIntegers(candidate.processed_comment_ids),
    processed_issue_comment_ids: extractPositiveIntegers(candidate.processed_issue_comment_ids),
    processed_run_ids: extractPositiveIntegers(candidate.processed_run_ids),
    last_ci_failure_signature: typeof candidate.last_ci_failure_signature === "string" && candidate.last_ci_failure_signature.trim() ? candidate.last_ci_failure_signature : null,
    last_ci_failure_summary: typeof candidate.last_ci_failure_summary === "string" && candidate.last_ci_failure_summary.trim() ? candidate.last_ci_failure_summary : null,
    same_ci_failure_count: typeof candidate.same_ci_failure_count === "number" && Number.isInteger(candidate.same_ci_failure_count) && candidate.same_ci_failure_count >= 0 ? candidate.same_ci_failure_count : 0
  };
}
function normalizeWatchState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createEmptyWatchState();
  }
  const record = value;
  const state = createEmptyWatchState();
  if (Array.isArray(record.queue)) {
    state.queue = record.queue.map((entry) => parsePositiveInteger(entry)).filter((entry) => entry !== void 0);
  }
  if (record.issues && typeof record.issues === "object" && !Array.isArray(record.issues)) {
    for (const [key, rawEntry] of Object.entries(record.issues)) {
      const normalized = normalizeWatchIssueEntry(rawEntry);
      if (!normalized) {
        continue;
      }
      state.issues[key] = normalized;
    }
  }
  const queueFromEntries = Object.values(state.issues).filter((entry) => entry.status === "queued").map((entry) => entry.issue_number);
  const mergedQueue = [...state.queue, ...queueFromEntries];
  const seen = /* @__PURE__ */ new Set();
  state.queue = mergedQueue.filter((issueNumber) => {
    if (seen.has(issueNumber)) {
      return false;
    }
    seen.add(issueNumber);
    return true;
  });
  return state;
}
function loadWatchState(homeDir) {
  const watchPath = getWatchStatePath(homeDir);
  if (!fs5.existsSync(watchPath)) {
    return createEmptyWatchState();
  }
  try {
    const parsed = JSON.parse(fs5.readFileSync(watchPath, "utf8"));
    return normalizeWatchState(parsed);
  } catch {
    return createEmptyWatchState();
  }
}
function saveWatchState(homeDir, state) {
  const watchPath = getWatchStatePath(homeDir);
  fs5.mkdirSync(path10.dirname(watchPath), { recursive: true });
  fs5.writeFileSync(watchPath, `${JSON.stringify(state, null, 2)}
`, "utf8");
}
function parsePositiveIntegerOption(value, fallback, optionName) {
  if (value === void 0 || value === null || value === "") {
    return fallback;
  }
  const parsed = parsePositiveInteger(value);
  if (!parsed) {
    throw new Error(`${optionName} must be a positive integer.`);
  }
  return parsed;
}
function watchEntryFromStartResult(result) {
  const now = ghLoopRuntime.now();
  return {
    issue_number: result.issue.number,
    session_id: result.session.id,
    branch: result.session.branch,
    repo: result.issue.repo,
    pr_number: result.pr?.number ?? null,
    pr_url: result.pr?.url ?? null,
    status: result.pending_completion ? "running" : "completed",
    completion_state: result.completion_state,
    completion_finalized: !result.pending_completion,
    created_at: now,
    updated_at: now,
    feedback_iteration: 0,
    max_feedback_iterations: GH_FEEDBACK_DEFAULT_MAX_ITERATIONS,
    processed_comment_ids: [],
    processed_issue_comment_ids: [],
    processed_run_ids: [],
    last_ci_failure_signature: null,
    last_ci_failure_summary: null,
    same_ci_failure_count: 0
  };
}
function getRunningTrackedCount(state) {
  return Object.values(state.issues).filter((entry) => entry.status === "running").length;
}
function setWatchEntry(state, entry) {
  state.issues[String(entry.issue_number)] = entry;
  state.queue = state.queue.filter((issueNumber) => issueNumber !== entry.issue_number);
}
function enqueueIssue(state, issue) {
  const now = ghLoopRuntime.now();
  const existing = state.issues[String(issue.number)];
  if (existing && (existing.status === "running" || existing.status === "completed")) {
    return;
  }
  state.issues[String(issue.number)] = {
    issue_number: issue.number,
    session_id: existing?.session_id ?? null,
    branch: existing?.branch ?? null,
    repo: existing?.repo ?? extractRepoFromIssueUrl(issue.url),
    pr_number: existing?.pr_number ?? null,
    pr_url: existing?.pr_url ?? null,
    status: "queued",
    completion_state: existing?.completion_state ?? null,
    completion_finalized: existing?.completion_finalized ?? false,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    feedback_iteration: existing?.feedback_iteration ?? 0,
    max_feedback_iterations: existing?.max_feedback_iterations ?? GH_FEEDBACK_DEFAULT_MAX_ITERATIONS,
    processed_comment_ids: existing?.processed_comment_ids ?? [],
    processed_issue_comment_ids: existing?.processed_issue_comment_ids ?? [],
    processed_run_ids: existing?.processed_run_ids ?? [],
    last_ci_failure_signature: existing?.last_ci_failure_signature ?? null,
    last_ci_failure_summary: existing?.last_ci_failure_summary ?? null,
    same_ci_failure_count: existing?.same_ci_failure_count ?? 0
  };
  if (!state.queue.includes(issue.number)) {
    state.queue.push(issue.number);
  }
}
function removeTrackedIssue(state, issueNumber) {
  delete state.issues[String(issueNumber)];
  state.queue = state.queue.filter((queuedIssue) => queuedIssue !== issueNumber);
}
function readSessionState(homeDir, sessionId) {
  const sessionDir = getSessionDir(homeDir, sessionId);
  const statusFile = path10.join(sessionDir, "status.json");
  if (!fs5.existsSync(statusFile)) {
    return null;
  }
  try {
    const raw = JSON.parse(fs5.readFileSync(statusFile, "utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return null;
    }
    const value = raw.state;
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}
async function refreshWatchState(homeDir, state) {
  const resolvedHomeDir = resolveHomeDir2(homeDir);
  const activeSessions = await ghLoopRuntime.listActiveSessions(resolvedHomeDir);
  const byId = new Map(activeSessions.map((session) => [session.session_id, session]));
  for (const entry of Object.values(state.issues)) {
    if (!entry.session_id || entry.status === "queued") {
      continue;
    }
    const active = byId.get(entry.session_id);
    if (active) {
      entry.status = "running";
      entry.updated_at = ghLoopRuntime.now();
      continue;
    }
    const sessionState = readSessionState(homeDir, entry.session_id);
    if (sessionState === "exited") {
      entry.status = "completed";
      entry.completion_state = sessionState;
      entry.updated_at = ghLoopRuntime.now();
    } else if (sessionState === "stopped") {
      entry.status = "stopped";
      entry.completion_state = sessionState;
      entry.updated_at = ghLoopRuntime.now();
    }
  }
  state.queue = state.queue.filter((issueNumber) => state.issues[String(issueNumber)]?.status === "queued");
  return byId;
}
function parseGhIssueList(raw) {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    return [];
  }
  const issues = [];
  for (const value of parsed) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }
    const record = value;
    const number = parsePositiveInteger(record.number);
    const title = typeof record.title === "string" ? record.title.trim() : "";
    const url = typeof record.url === "string" ? record.url.trim() : "";
    if (!number || !title || !url) {
      continue;
    }
    issues.push({ number, title, url });
  }
  return issues;
}
async function fetchMatchingIssues(options) {
  const labels = Array.isArray(options.label) && options.label.length > 0 ? options.label : [GH_WATCH_DEFAULT_LABEL];
  const args = ["issue", "list", "--state", "open", "--json", "number,title,url", "--limit", "100"];
  for (const label of labels) {
    if (label.trim()) {
      args.push("--label", label.trim());
    }
  }
  if (typeof options.assignee === "string" && options.assignee.trim()) {
    args.push("--assignee", options.assignee.trim());
  }
  if (typeof options.milestone === "string" && options.milestone.trim()) {
    args.push("--milestone", options.milestone.trim());
  }
  if (typeof options.repo === "string" && options.repo.trim()) {
    args.push("--repo", options.repo.trim());
  }
  try {
    const response = await ghExecutor.exec(args);
    return parseGhIssueList(response.stdout);
  } catch (error) {
    throw new Error(`gh issue list failed: ${extractGhCliError(error)}`);
  }
}
async function launchTrackedIssue(issueNumber, options, state) {
  const result = await ghLoopRuntime.startIssue({
    issue: issueNumber,
    repo: options.repo,
    homeDir: options.homeDir,
    projectRoot: options.projectRoot,
    provider: options.provider,
    max: options.max,
    output: "json"
  });
  const entry = watchEntryFromStartResult(result);
  setWatchEntry(state, entry);
  return entry;
}
function buildCiFailureSignature(failedChecks) {
  if (failedChecks.length === 0) {
    return null;
  }
  const parts = failedChecks.map((check) => {
    const tail = (check.log ?? "").split("\n").slice(-20).join("\n");
    return `${check.name}|${normalizeCiDetailForSignature(tail)}`;
  }).sort();
  return parts.join("||");
}
function buildCiFailureSummary(failedChecks) {
  if (failedChecks.length === 0) {
    return "No CI failures detected.";
  }
  const lines = failedChecks.map((check) => {
    const tail = (check.log ?? "").split("\n").slice(-8).map((line) => line.trim()).filter(Boolean).join(" | ");
    return `- ${check.name}${tail ? `: ${tail}` : ""}`;
  });
  return ["CI failures:", ...lines].join("\n");
}
async function fetchPrReviewComments(repo, prNumber) {
  const commentsResponse = await ghExecutor.exec([
    "api",
    `repos/${repo}/pulls/${prNumber}/comments`,
    "--method",
    "GET"
  ]);
  const parsed = JSON.parse(commentsResponse.stdout || "[]");
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter((entry) => Boolean(entry) && typeof entry === "object").map((entry) => ({
    id: typeof entry.id === "number" ? entry.id : 0,
    body: typeof entry.body === "string" ? entry.body : "",
    user: entry.user && typeof entry.user === "object" ? { login: typeof entry.user.login === "string" ? entry.user.login : void 0 } : void 0,
    path: typeof entry.path === "string" ? entry.path : void 0,
    line: typeof entry.line === "number" ? entry.line : void 0,
    state: typeof entry.state === "string" ? entry.state : void 0
  })).filter((comment) => comment.id > 0);
}
async function fetchPrIssueComments(repo, prNumber) {
  const response = await ghExecutor.exec([
    "api",
    `repos/${repo}/issues/${prNumber}/comments`,
    "--method",
    "GET"
  ]);
  const parsed = JSON.parse(response.stdout || "[]");
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter((entry) => Boolean(entry) && typeof entry === "object").map((entry) => ({
    id: typeof entry.id === "number" ? entry.id : 0,
    body: typeof entry.body === "string" ? entry.body : "",
    user: entry.user && typeof entry.user === "object" ? { login: typeof entry.user.login === "string" ? entry.user.login : void 0 } : void 0
  })).filter((comment) => comment.id > 0);
}
async function fetchFailedCheckLogs(repo, sha) {
  const logs = /* @__PURE__ */ new Map();
  try {
    const runsResponse = await ghExecutor.exec([
      "run",
      "list",
      "--repo",
      repo,
      "--commit",
      sha,
      "--status",
      "failure",
      "--json",
      "databaseId",
      "--limit",
      "5"
    ]);
    const runs = JSON.parse(runsResponse.stdout || "[]");
    for (const run of runs) {
      try {
        const logResponse = await ghExecutor.exec([
          "run",
          "view",
          String(run.databaseId),
          "--repo",
          repo,
          "--log-failed"
        ]);
        if (logResponse.stdout.trim()) {
          logs.set(run.databaseId, logResponse.stdout.trim());
        }
      } catch {
      }
    }
  } catch {
  }
  return logs;
}
async function fetchPrCheckRuns(repo, prNumber) {
  const prResponse = await ghExecutor.exec([
    "api",
    `repos/${repo}/pulls/${prNumber}`,
    "--method",
    "GET",
    "--jq",
    ".head.sha"
  ]);
  const sha = prResponse.stdout.trim();
  if (!sha) {
    return [];
  }
  const checksResponse = await ghExecutor.exec([
    "api",
    `repos/${repo}/commits/${sha}/check-runs`,
    "--method",
    "GET"
  ]);
  const parsed = JSON.parse(checksResponse.stdout || "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return [];
  }
  const checkRuns = parsed.check_runs;
  if (!Array.isArray(checkRuns)) {
    return [];
  }
  const runs = checkRuns.filter((entry) => Boolean(entry) && typeof entry === "object").map((entry) => ({
    id: typeof entry.id === "number" ? entry.id : 0,
    name: typeof entry.name === "string" ? entry.name : "",
    status: typeof entry.status === "string" ? entry.status : "",
    conclusion: typeof entry.conclusion === "string" ? entry.conclusion : null,
    html_url: typeof entry.html_url === "string" ? entry.html_url : void 0,
    log: void 0
  })).filter((run) => run.id > 0);
  const hasFailures = runs.some((r) => r.status === "completed" && r.conclusion === "failure");
  if (hasFailures) {
    const logs = await fetchFailedCheckLogs(repo, sha);
    if (logs.size > 0) {
      const combinedLog = Array.from(logs.values()).join("\n---\n");
      for (const run of runs) {
        if (run.status === "completed" && run.conclusion === "failure") {
          run.log = combinedLog;
        }
      }
    }
  }
  return runs;
}
function collectNewFeedback(entry, reviewComments, issueComments, checkRuns) {
  const processedCommentSet = new Set(entry.processed_comment_ids);
  const processedIssueCommentSet = new Set(entry.processed_issue_comment_ids);
  const processedRunSet = new Set(entry.processed_run_ids);
  const newReviewComments = reviewComments.filter((comment) => !processedCommentSet.has(comment.id));
  const newIssueComments = issueComments.filter((comment) => !processedIssueCommentSet.has(comment.id)).filter((comment) => comment.body.toLowerCase().includes("@aloop"));
  const failedChecks = checkRuns.filter((run) => run.status === "completed" && run.conclusion === "failure").filter((run) => !processedRunSet.has(run.id));
  return {
    new_comments: newReviewComments,
    new_issue_comments: newIssueComments,
    failed_checks: failedChecks
  };
}
function hasFeedback(feedback) {
  return feedback.new_comments.length > 0 || feedback.new_issue_comments.length > 0 || feedback.failed_checks.length > 0;
}
function buildFeedbackSteering(feedback, prNumber) {
  const parts = [
    "# PR Feedback \u2014 Automated Re-iteration",
    "",
    `PR #${prNumber} received feedback that requires fixes.`,
    ""
  ];
  if (feedback.new_comments.length > 0) {
    parts.push("## Review Comments", "");
    for (const comment of feedback.new_comments) {
      const author = comment.user?.login ?? "unknown";
      const location = comment.path ? `${comment.path}${comment.line ? `:${comment.line}` : ""}` : "";
      parts.push(`### ${author}${location ? ` \u2014 \`${location}\`` : ""}`);
      parts.push("");
      parts.push(comment.body.trim());
      parts.push("");
    }
  }
  if (feedback.new_issue_comments.length > 0) {
    parts.push("## Mentions (@aloop)", "");
    for (const comment of feedback.new_issue_comments) {
      const author = comment.user?.login ?? "unknown";
      parts.push(`### @${author} (comment)`);
      parts.push("");
      parts.push(comment.body.trim());
      parts.push("");
    }
  }
  if (feedback.failed_checks.length > 0) {
    parts.push("## CI Failures", "");
    for (const check of feedback.failed_checks) {
      parts.push(`- **${check.name}** failed${check.html_url ? ` ([view](${check.html_url}))` : ""}`);
      if (check.log) {
        parts.push("");
        parts.push("```");
        const logLines = check.log.split("\n");
        if (logLines.length > 200) {
          parts.push("... (truncated)");
          parts.push(...logLines.slice(-200));
        } else {
          parts.push(check.log);
        }
        parts.push("```");
        parts.push("");
      }
    }
    parts.push("");
    parts.push("Fix the CI failures above. Review the error logs and address root causes.");
    parts.push("");
  }
  parts.push("Address all feedback above, then commit and push.");
  return parts.join("\n");
}
function markFeedbackProcessed(entry, feedback) {
  for (const comment of feedback.new_comments) {
    if (!entry.processed_comment_ids.includes(comment.id)) {
      entry.processed_comment_ids.push(comment.id);
    }
  }
  for (const comment of feedback.new_issue_comments) {
    if (!entry.processed_issue_comment_ids.includes(comment.id)) {
      entry.processed_issue_comment_ids.push(comment.id);
    }
  }
  for (const check of feedback.failed_checks) {
    if (!entry.processed_run_ids.includes(check.id)) {
      entry.processed_run_ids.push(check.id);
    }
  }
  entry.feedback_iteration += 1;
  entry.updated_at = ghLoopRuntime.now();
}
async function checkAndApplyPrFeedback(entry, options) {
  if (!entry.repo || !entry.pr_number || !entry.session_id) {
    return false;
  }
  if (entry.status !== "completed") {
    return false;
  }
  if (entry.feedback_iteration >= entry.max_feedback_iterations) {
    return false;
  }
  let reviewComments;
  let issueComments;
  let checkRuns;
  try {
    [reviewComments, issueComments, checkRuns] = await Promise.all([
      fetchPrReviewComments(entry.repo, entry.pr_number),
      fetchPrIssueComments(entry.repo, entry.pr_number),
      fetchPrCheckRuns(entry.repo, entry.pr_number)
    ]);
  } catch {
    return false;
  }
  const feedback = collectNewFeedback(entry, reviewComments, issueComments, checkRuns);
  const ciSignature = buildCiFailureSignature(feedback.failed_checks);
  if (ciSignature) {
    const nextSameFailureCount = entry.last_ci_failure_signature === ciSignature ? (entry.same_ci_failure_count ?? 0) + 1 : 1;
    entry.last_ci_failure_signature = ciSignature;
    entry.last_ci_failure_summary = buildCiFailureSummary(feedback.failed_checks);
    entry.same_ci_failure_count = nextSameFailureCount;
    if (nextSameFailureCount >= GH_SAME_CI_FAILURE_LIMIT) {
      markFeedbackProcessed(entry, feedback);
      entry.status = "stopped";
      entry.completion_state = "persistent_ci_failure";
      entry.updated_at = ghLoopRuntime.now();
      const summary = [
        `Auto re-iteration halted for #${entry.issue_number}.`,
        `Same CI failure persisted for ${nextSameFailureCount} consecutive attempts.`,
        entry.last_ci_failure_summary,
        "Please investigate manually and update the branch before resuming."
      ].join("\n\n");
      try {
        await ghExecutor.exec([
          "issue",
          "comment",
          String(entry.issue_number),
          "--repo",
          entry.repo,
          "--body",
          summary
        ]);
      } catch {
      }
      return false;
    }
  } else {
    entry.last_ci_failure_signature = null;
    entry.last_ci_failure_summary = null;
    entry.same_ci_failure_count = 0;
  }
  if (!hasFeedback(feedback)) {
    let updated = false;
    for (const c of reviewComments) {
      if (!entry.processed_comment_ids.includes(c.id)) {
        entry.processed_comment_ids.push(c.id);
        updated = true;
      }
    }
    for (const c of issueComments) {
      if (!entry.processed_issue_comment_ids.includes(c.id)) {
        entry.processed_issue_comment_ids.push(c.id);
        updated = true;
      }
    }
    if (updated) {
      entry.updated_at = ghLoopRuntime.now();
    }
    return false;
  }
  const sessionDir = getSessionDir(options.homeDir, entry.session_id);
  const worktreePath = path10.join(sessionDir, "worktree");
  const steeringPath = path10.join(worktreePath, "STEERING.md");
  const steeringContent = buildFeedbackSteering(feedback, entry.pr_number);
  fs5.mkdirSync(path10.dirname(steeringPath), { recursive: true });
  fs5.writeFileSync(steeringPath, steeringContent, "utf8");
  try {
    await ghLoopRuntime.startIssue({
      issue: entry.issue_number,
      repo: entry.repo,
      homeDir: options.homeDir,
      projectRoot: worktreePath,
      provider: options.provider,
      max: options.max,
      output: "json"
    });
  } catch {
    return false;
  }
  markFeedbackProcessed(entry, feedback);
  entry.status = "running";
  return true;
}
async function finalizeWatchEntry(entry, options) {
  if (!entry.repo || !entry.branch || !entry.session_id || !entry.completion_state) {
    return false;
  }
  const sessionDir = getSessionDir(options.homeDir, entry.session_id);
  const metaPath = path10.join(sessionDir, "meta.json");
  let projectRoot = options.projectRoot ?? process.cwd();
  if (fs5.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs5.readFileSync(metaPath, "utf8"));
      if (typeof meta.project_root === "string" && meta.project_root.trim()) {
        projectRoot = meta.project_root;
      }
    } catch {
    }
  }
  let issueTitle = `Issue ${entry.issue_number}`;
  try {
    const issueRaw = await ghExecutor.exec(["issue", "view", String(entry.issue_number), "--json", "title", "--repo", entry.repo]);
    const issuePayload = JSON.parse(issueRaw.stdout);
    if (issuePayload.title) {
      issueTitle = issuePayload.title;
    }
  } catch {
  }
  let baseBranch = "main";
  try {
    await execFileAsync("git", ["-C", projectRoot, "rev-parse", "--verify", "agent/main"]);
    baseBranch = "agent/main";
  } catch {
    try {
      await execFileAsync("git", ["-C", projectRoot, "branch", "agent/main", "main"]);
      baseBranch = "agent/main";
    } catch {
      baseBranch = "main";
    }
  }
  const prTitle = `[aloop] ${issueTitle}`;
  const prBody = `Automated implementation for issue #${entry.issue_number}.

Closes #${entry.issue_number}`;
  try {
    const prCreate = await ghExecutor.exec([
      "pr",
      "create",
      "--repo",
      entry.repo,
      "--base",
      baseBranch,
      "--head",
      entry.branch,
      "--title",
      prTitle,
      "--body",
      prBody
    ]);
    const pr = parsePrReference(prCreate.stdout);
    if (pr.number !== null) {
      entry.pr_number = pr.number;
      entry.pr_url = pr.url;
      const configPath = path10.join(sessionDir, "config.json");
      if (fs5.existsSync(configPath)) {
        try {
          const config = JSON.parse(fs5.readFileSync(configPath, "utf8"));
          const createdPrNumbers = extractPositiveIntegers(config.created_pr_numbers);
          const next = new Set(createdPrNumbers);
          next.add(pr.number);
          config.created_pr_numbers = Array.from(next.values());
          config.childCreatedPrNumbers = Array.from(next.values());
          fs5.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}
`, "utf8");
        } catch {
        }
      }
    }
  } catch (err) {
    try {
      const prList = await ghExecutor.exec([
        "pr",
        "list",
        "--repo",
        entry.repo,
        "--head",
        entry.branch,
        "--json",
        "number,url"
      ]);
      const existing = JSON.parse(prList.stdout);
      if (existing.length > 0) {
        entry.pr_number = existing[0].number;
        entry.pr_url = existing[0].url;
      }
    } catch {
    }
  }
  if (entry.pr_number === null) {
    return false;
  }
  const summary = [
    `Aloop session ${entry.session_id} completed for #${entry.issue_number}.`,
    entry.pr_url ? `Created PR: ${entry.pr_url}` : "Created PR (URL unavailable).",
    `Branch: ${entry.branch}`,
    `State: ${entry.completion_state}`
  ].join("\n");
  try {
    await ghExecutor.exec(["issue", "comment", String(entry.issue_number), "--repo", entry.repo, "--body", summary]);
  } catch {
    return false;
  }
  return true;
}
async function runGhWatchCycle(options) {
  const maxConcurrent = parsePositiveIntegerOption(options.maxConcurrent, GH_WATCH_DEFAULT_MAX_CONCURRENT, "--max-concurrent");
  const state = loadWatchState(options.homeDir);
  await refreshWatchState(options.homeDir, state);
  const matchedIssues = await fetchMatchingIssues(options);
  for (const issue of matchedIssues) {
    if (!state.issues[String(issue.number)]) {
      enqueueIssue(state, issue);
    }
  }
  const feedbackResumed = [];
  const completedWithPr = Object.values(state.issues).filter(
    (entry) => entry.status === "completed" && entry.pr_number !== null
  );
  for (const entry of completedWithPr) {
    const resumed = await checkAndApplyPrFeedback(entry, options);
    if (resumed) {
      feedbackResumed.push(entry.issue_number);
    }
  }
  const newlyCompleted = Object.values(state.issues).filter(
    (entry) => (entry.status === "completed" || entry.status === "stopped") && isTerminalState(entry.completion_state) && !entry.completion_finalized
  );
  for (const entry of newlyCompleted) {
    const success = await finalizeWatchEntry(entry, options);
    if (success) {
      entry.completion_finalized = true;
      entry.updated_at = ghLoopRuntime.now();
    }
  }
  const started = [];
  const queued = [...state.queue];
  let running = getRunningTrackedCount(state);
  while (running < maxConcurrent && state.queue.length > 0) {
    const nextIssue = state.queue.shift();
    if (!nextIssue) {
      break;
    }
    const launched = await launchTrackedIssue(nextIssue, options, state);
    started.push(nextIssue);
    if (launched.status === "running") {
      running += 1;
    }
  }
  saveWatchState(options.homeDir, state);
  return {
    started,
    queued,
    active: running,
    tracked: Object.keys(state.issues).length,
    feedback_resumed: feedbackResumed
  };
}
async function ghWatchCommand(options) {
  const outputMode = options.output ?? "text";
  const intervalSeconds = parsePositiveIntegerOption(options.interval, GH_WATCH_DEFAULT_INTERVAL_SECONDS, "--interval");
  const runOnce = options.once === true;
  if (runOnce) {
    const summary = await runGhWatchCycle(options);
    if (outputMode === "json") {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }
    console.log(`watch cycle complete: started=${summary.started.length} queued=${summary.queued.length} active=${summary.active} tracked=${summary.tracked} feedback_resumed=${summary.feedback_resumed.length}`);
    return;
  }
  let stopping = false;
  const markStopping = () => {
    stopping = true;
  };
  process.on("SIGINT", markStopping);
  process.on("SIGTERM", markStopping);
  try {
    while (!stopping) {
      const summary = await runGhWatchCycle(options);
      if (outputMode === "json") {
        console.log(JSON.stringify(summary));
      } else {
        console.log(`watch cycle complete: started=${summary.started.length} queued=${summary.queued.length} active=${summary.active} tracked=${summary.tracked} feedback_resumed=${summary.feedback_resumed.length}`);
      }
      if (stopping) {
        break;
      }
      await new Promise((resolve2) => setTimeout(resolve2, intervalSeconds * 1e3));
    }
  } finally {
    process.off("SIGINT", markStopping);
    process.off("SIGTERM", markStopping);
  }
}
function failGhWatch(outputMode, error) {
  const message = `gh watch failed: ${extractGhCliError(error)}`;
  if (outputMode === "json") {
    console.log(JSON.stringify({ success: false, error: message }));
  } else {
    console.error(message);
  }
  return process.exit(1);
}
function formatGhStatusRows(state, sessionsById) {
  const entries = Object.values(state.issues).sort((a, b) => a.issue_number - b.issue_number);
  if (entries.length === 0) {
    return "No GH-linked sessions.";
  }
  const lines = [
    "Issue  Branch                PR    Status      Iteration  Feedback"
  ];
  for (const entry of entries) {
    const branch = entry.status === "queued" ? "(queued)" : entry.branch ?? "\u2014";
    const prRef = entry.pr_number ? `#${entry.pr_number}` : "\u2014";
    const session = entry.session_id ? sessionsById.get(entry.session_id) : void 0;
    const iteration = session?.iteration !== null && session?.iteration !== void 0 ? String(session.iteration) : "\u2014";
    const issueCell = `#${entry.issue_number}`.padEnd(6);
    const feedbackCell = entry.feedback_iteration > 0 ? `${entry.feedback_iteration}/${entry.max_feedback_iterations}` : "\u2014";
    lines.push(`${issueCell} ${branch.padEnd(20)} ${prRef.padEnd(5)} ${entry.status.padEnd(11)} ${iteration.padEnd(9)} ${feedbackCell}`);
  }
  return lines.join("\n");
}
async function ghStatusCommand(options) {
  const outputMode = options.output ?? "text";
  const state = loadWatchState(options.homeDir);
  const sessionsById = await refreshWatchState(options.homeDir, state);
  saveWatchState(options.homeDir, state);
  const entries = Object.values(state.issues).sort((a, b) => a.issue_number - b.issue_number);
  if (outputMode === "json") {
    console.log(JSON.stringify({ issues: entries }, null, 2));
    return;
  }
  console.log(formatGhStatusRows(state, sessionsById));
}
async function ghStopCommand(options) {
  const outputMode = options.output ?? "text";
  const issueNumber = parsePositiveInteger(options.issue);
  const stopAll = options.all === true;
  if (!stopAll && !issueNumber) {
    throw new Error("gh stop requires either --issue <number> or --all.");
  }
  if (stopAll && issueNumber) {
    throw new Error("gh stop accepts either --issue or --all, not both.");
  }
  const state = loadWatchState(options.homeDir);
  await refreshWatchState(options.homeDir, state);
  const targets = stopAll ? Object.values(state.issues) : issueNumber ? [state.issues[String(issueNumber)]].filter((entry) => Boolean(entry)) : [];
  if (!stopAll && issueNumber && targets.length === 0) {
    throw new Error(`No GH-linked session found for issue #${issueNumber}.`);
  }
  const resolvedHomeDir = resolveHomeDir2(options.homeDir);
  const results = [];
  for (const entry of targets) {
    if (entry.session_id && entry.status === "running") {
      const stopResult = await ghLoopRuntime.stopSession(resolvedHomeDir, entry.session_id);
      results.push({ issue_number: entry.issue_number, session_id: entry.session_id, success: stopResult.success, reason: stopResult.reason });
    } else {
      results.push({ issue_number: entry.issue_number, session_id: entry.session_id, success: true });
    }
    removeTrackedIssue(state, entry.issue_number);
  }
  saveWatchState(options.homeDir, state);
  const failed = results.filter((result) => !result.success);
  if (outputMode === "json") {
    console.log(JSON.stringify({ stopped: results, failed: failed.length }, null, 2));
  } else if (results.length === 0) {
    console.log("No GH-linked sessions to stop.");
  } else {
    for (const result of results) {
      if (result.success) {
        console.log(`Stopped GH-linked issue #${result.issue_number}${result.session_id ? ` (${result.session_id})` : ""}.`);
      } else {
        console.log(`Failed to stop issue #${result.issue_number}: ${result.reason ?? "unknown error"}`);
      }
    }
  }
  if (failed.length > 0) {
    process.exit(1);
  }
}
function addGhRequestSubcommand(name, description) {
  return ghCommand.command(name).description(description).requiredOption("--session <id>", "Session ID").requiredOption("--request <file>", "Request JSON file path").option("--role <role>", "Role: child-loop or orchestrator", "child-loop").option("--home-dir <dir>", "Home directory override").action(withErrorHandling(async (options) => {
    await executeGhOperation(name, options);
  }));
}
function addGhSinceSubcommand(name, description) {
  return ghCommand.command(name).description(description).requiredOption("--session <id>", "Session ID").requiredOption("--since <timestamp>", "Only return comments created at/after this timestamp (ISO-8601)").option("--role <role>", "Role: child-loop or orchestrator", "orchestrator").option("--home-dir <dir>", "Home directory override").action(withErrorHandling(async (options) => {
    await executeGhOperation(name, options);
  }));
}
ghCommand.command("start").description("Start a GitHub-linked aloop session for an issue").requiredOption("--issue <number>", "GitHub issue number").option("--spec <path>", "Additional specification file to include in prompt context").option("--provider <provider>", "Provider override for the launched loop").option("--max <number>", "Max iteration override").option("--repo <owner/repo>", "Explicit GitHub repository (defaults to issue URL owner/repo)").option("--project-root <path>", "Project root override").option("--home-dir <path>", "Home directory override").option("--output <mode>", "Output format: json or text", "text").action(withErrorHandling(async (options) => {
  const result = await ghStartCommandWithDeps(options);
  if (options.output === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Started GH-linked session ${result.session.id} for issue #${result.issue.number}.`);
  console.log(`Branch: ${result.session.branch}`);
  console.log(`Base branch: ${result.base_branch}`);
  console.log(`Work dir: ${result.session.work_dir}`);
  if (result.pending_completion) {
    console.log("Loop is still running; PR creation and issue summary comment will occur when the session reaches a terminal state.");
  } else if (result.pr?.url) {
    console.log(`PR: ${result.pr.url}`);
    console.log("Posted summary comment back to the source issue.");
  }
  if (result.warnings.length > 0) {
    for (const warning of result.warnings) {
      console.log(`Warning: ${warning}`);
    }
  }
}));
ghCommand.command("watch").description("Monitor matching issues and start GH-linked loops with queueing").option("--label <label...>", "Issue labels to match (default: aloop)").option("--assignee <assignee>", "Only include issues assigned to this user").option("--milestone <milestone>", "Only include issues in this milestone").option("--max-concurrent <number>", "Max running GH-linked loops", String(GH_WATCH_DEFAULT_MAX_CONCURRENT)).option("--interval <seconds>", "Polling interval in seconds", String(GH_WATCH_DEFAULT_INTERVAL_SECONDS)).option("--repo <owner/repo>", "Explicit GitHub repository (default: current)").option("--provider <provider>", "Provider override for spawned loops").option("--max <number>", "Max iteration override for spawned loops").option("--project-root <path>", "Project root override for spawned loops").option("--home-dir <path>", "Home directory override").option("--once", "Run a single poll cycle and exit").option("--output <mode>", "Output format: json or text", "text").action(async (options) => {
  const outputMode = options.output ?? "text";
  try {
    await ghWatchCommand(options);
  } catch (error) {
    failGhWatch(outputMode, error);
  }
});
ghCommand.command("status").description("Show GH-linked issue/session/PR state from watch tracking").option("--home-dir <path>", "Home directory override").option("--output <mode>", "Output format: json or text", "text").action(withErrorHandling(async (options) => {
  await ghStatusCommand(options);
}));
ghCommand.command("stop").description("Stop GH-linked loops for one issue or all tracked issues").option("--issue <number>", "GitHub issue number to stop").option("--all", "Stop all tracked GH-linked loops").option("--home-dir <path>", "Home directory override").option("--output <mode>", "Output format: json or text", "text").action(withErrorHandling(async (options) => {
  await ghStopCommand(options);
}));
addGhRequestSubcommand("pr-create", "Create a pull request");
addGhRequestSubcommand("pr-comment", "Comment on a pull request");
addGhRequestSubcommand("issue-comment", "Comment on an issue");
addGhRequestSubcommand("issue-create", "Create an issue (orchestrator only)");
addGhRequestSubcommand("issue-close", "Close an issue (orchestrator only)");
addGhRequestSubcommand("issue-label", "Add/remove issue labels (orchestrator only)");
addGhRequestSubcommand("pr-merge", "Merge a pull request (orchestrator only)");
addGhRequestSubcommand("branch-delete", "Delete a branch (always rejected)");
addGhSinceSubcommand("issue-comments", "List issue comments since a timestamp (orchestrator only)");
addGhSinceSubcommand("pr-comments", "List pull request review comments since a timestamp (orchestrator only)");
function getSessionDir(homeDir, sessionId) {
  const baseHome = homeDir || os4.homedir();
  return path10.join(baseHome, ".aloop", "sessions", sessionId);
}
function parsePositiveInteger(value) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number.parseInt(value, 10);
    if (parsed > 0) {
      return parsed;
    }
  }
  return void 0;
}
function sanitizeBranchSlug(value) {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) {
    return "issue";
  }
  return slug.slice(0, 40).replace(/-+$/g, "");
}
function extractRepoFromIssueUrl(url) {
  const match = url.match(/^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/issues\/\d+/i);
  if (!match) {
    return null;
  }
  return `${match[1]}/${match[2]}`;
}
function parsePrReference(raw) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { number: null, url: null };
  }
  const match = trimmed.match(/\/pull\/(\d+)/);
  return {
    number: match ? Number.parseInt(match[1], 10) : null,
    url: trimmed
  };
}
function extractPositiveIntegers(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values.map((value) => parsePositiveInteger(value)).filter((value) => value !== void 0);
}
function normalizeIssuePayload(payload, expectedIssueNumber) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid issue payload returned by gh issue view.");
  }
  const issue = payload;
  const number = parsePositiveInteger(issue.number);
  if (number !== expectedIssueNumber) {
    throw new Error(`gh issue view returned unexpected issue number: ${String(issue.number)}`);
  }
  const title = typeof issue.title === "string" ? issue.title.trim() : "";
  const url = typeof issue.url === "string" ? issue.url.trim() : "";
  if (!title || !url) {
    throw new Error("Issue payload is missing required title/url fields.");
  }
  const labels = Array.isArray(issue.labels) ? issue.labels.filter((entry) => Boolean(entry) && typeof entry === "object").map((entry) => ({ name: typeof entry.name === "string" ? entry.name : void 0 })) : [];
  const comments = Array.isArray(issue.comments) ? issue.comments.filter((entry) => Boolean(entry) && typeof entry === "object").map((entry) => ({
    author: entry.author && typeof entry.author === "object" ? { login: typeof entry.author.login === "string" ? entry.author.login : void 0 } : void 0,
    body: typeof entry.body === "string" ? entry.body : void 0
  })) : [];
  return {
    number,
    title,
    body: typeof issue.body === "string" ? issue.body : "",
    url,
    labels,
    comments
  };
}
function buildIssueContextBlock(issue, specContent) {
  const labels = (issue.labels ?? []).map((label) => label.name).filter((name) => Boolean(name));
  const commentLines = (issue.comments ?? []).slice(-10).map((comment, index) => {
    const author = comment.author?.login ?? "unknown";
    const body = (comment.body ?? "").trim().replace(/\s+/g, " ");
    const snippet = body.length > 160 ? `${body.slice(0, 157)}...` : body;
    return `${index + 1}. @${author}: ${snippet}`;
  });
  const parts = [
    "<!-- aloop-gh-issue-context:start -->",
    "# GitHub Issue Requirements",
    "",
    `Issue: #${issue.number} \u2014 ${issue.title}`,
    `URL: ${issue.url}`,
    `Labels: ${labels.length > 0 ? labels.join(", ") : "(none)"}`,
    "",
    "## Issue Body",
    "",
    (issue.body ?? "").trim() || "(empty)"
  ];
  if (commentLines.length > 0) {
    parts.push("", "## Recent Comments", "", ...commentLines);
  }
  if (specContent !== null) {
    parts.push("", "## Additional Spec Context (--spec)", "", specContent.trim() || "(empty)");
  }
  parts.push("", "<!-- aloop-gh-issue-context:end -->", "");
  return parts.join("\n");
}
function upsertIssueContextPrompt(existingContent, contextBlock) {
  const pattern = /<!-- aloop-gh-issue-context:start -->[\s\S]*?<!-- aloop-gh-issue-context:end -->\n*/g;
  const stripped = existingContent.replace(pattern, "").trimStart();
  return `${contextBlock}${stripped.endsWith("\n") ? stripped : `${stripped}
`}`;
}
function isTerminalState(value) {
  return value === "exited" || value === "stopped";
}
function loadJsonObject(filePath, deps) {
  if (!deps.existsSync(filePath)) {
    return {};
  }
  try {
    const parsed = JSON.parse(deps.readFile(filePath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}
async function ghStartCommandWithDeps(options, deps = defaultGhStartDeps) {
  const issueNumber = parsePositiveInteger(options.issue);
  if (!issueNumber) {
    throw new Error("gh start requires --issue <number>.");
  }
  const warnings = [];
  const issueViewArgs = ["issue", "view", String(issueNumber), "--json", "number,title,body,url,labels,comments"];
  const requestedRepo = typeof options.repo === "string" && options.repo.trim() ? options.repo.trim() : null;
  if (requestedRepo) {
    issueViewArgs.push("--repo", requestedRepo);
  }
  const issueRaw = await deps.execGh(issueViewArgs);
  const issuePayload = JSON.parse(issueRaw.stdout);
  const issue = normalizeIssuePayload(issuePayload, issueNumber);
  const issueRepo = requestedRepo ?? extractRepoFromIssueUrl(issue.url);
  if (!issueRepo) {
    warnings.push("Could not infer repository from issue URL; PR creation/link-back will require --repo.");
  }
  let specContent = null;
  if (typeof options.spec === "string" && options.spec.trim()) {
    const specPath = path10.isAbsolute(options.spec) ? options.spec : path10.join(deps.cwd(), options.spec);
    if (!deps.existsSync(specPath)) {
      throw new Error(`--spec file not found: ${specPath}`);
    }
    specContent = deps.readFile(specPath, "utf8");
  }
  const started = await deps.startSession({
    projectRoot: options.projectRoot,
    homeDir: options.homeDir,
    provider: options.provider,
    maxIterations: options.max
  });
  if (!started.worktree || !started.worktree_path || !started.branch) {
    throw new Error("gh start requires a git worktree session. Remove in-place/worktree fallback constraints and retry.");
  }
  const desiredBranch = `agent/issue-${issue.number}-${sanitizeBranchSlug(issue.title)}`;
  if (started.branch !== desiredBranch) {
    await deps.execGit(["-C", started.worktree_path, "branch", "-m", desiredBranch]);
  }
  const planPromptPath = path10.join(started.prompts_dir, "PROMPT_plan.md");
  if (!deps.existsSync(planPromptPath)) {
    throw new Error(`Missing planner prompt: ${planPromptPath}`);
  }
  const currentPlanPrompt = deps.readFile(planPromptPath, "utf8");
  const issueContext = buildIssueContextBlock(issue, specContent);
  deps.writeFile(planPromptPath, upsertIssueContextPrompt(currentPlanPrompt, issueContext));
  const metaPath = path10.join(started.session_dir, "meta.json");
  const statusPath = path10.join(started.session_dir, "status.json");
  const configPath = path10.join(started.session_dir, "config.json");
  const meta = loadJsonObject(metaPath, deps);
  meta.branch = desiredBranch;
  meta.gh_issue_number = issue.number;
  meta.gh_issue_url = issue.url;
  meta.gh_repo = issueRepo;
  deps.writeFile(metaPath, `${JSON.stringify(meta, null, 2)}
`);
  const config = loadJsonObject(configPath, deps);
  const createdPrNumbers = extractPositiveIntegers(config.created_pr_numbers);
  config.repo = issueRepo;
  config.issue_number = issue.number;
  config.assignedIssueNumber = issue.number;
  config.created_pr_numbers = createdPrNumbers;
  config.childCreatedPrNumbers = createdPrNumbers;
  config.role = "child-loop";
  config.issue_url = issue.url;
  deps.writeFile(configPath, `${JSON.stringify(config, null, 2)}
`);
  let baseBranch = "main";
  const projectRoot = typeof meta.project_root === "string" && meta.project_root.trim() ? meta.project_root : options.projectRoot ?? deps.cwd();
  try {
    await deps.execGit(["-C", projectRoot, "rev-parse", "--verify", "agent/main"]);
    baseBranch = "agent/main";
  } catch {
    try {
      await deps.execGit(["-C", projectRoot, "branch", "agent/main", "main"]);
      baseBranch = "agent/main";
    } catch {
      warnings.push("Unable to create agent/main from main; PR base will remain main.");
      baseBranch = "main";
    }
  }
  const status = loadJsonObject(statusPath, deps);
  const completionState = typeof status.state === "string" ? status.state : null;
  let pr = null;
  let issueCommentPosted = false;
  let pendingCompletion = true;
  if (isTerminalState(completionState) && issueRepo) {
    const prTitle = `[aloop] ${issue.title}`;
    const prBody = `Automated implementation for issue #${issue.number}.

Closes #${issue.number}`;
    const prCreate = await deps.execGh([
      "pr",
      "create",
      "--repo",
      issueRepo,
      "--base",
      baseBranch,
      "--head",
      desiredBranch,
      "--title",
      prTitle,
      "--body",
      prBody
    ]);
    pr = parsePrReference(prCreate.stdout);
    if (pr.number !== null) {
      const next = new Set(createdPrNumbers);
      next.add(pr.number);
      config.created_pr_numbers = Array.from(next.values());
      config.childCreatedPrNumbers = Array.from(next.values());
      deps.writeFile(configPath, `${JSON.stringify(config, null, 2)}
`);
    }
    const summary = [
      `Aloop session ${started.session_id} completed for #${issue.number}.`,
      pr?.url ? `Created PR: ${pr.url}` : "Created PR (URL unavailable).",
      `Branch: ${desiredBranch}`,
      `State: ${completionState}`
    ].join("\n");
    await deps.execGh(["issue", "comment", String(issue.number), "--repo", issueRepo, "--body", summary]);
    issueCommentPosted = true;
    pendingCompletion = false;
  } else {
    pendingCompletion = true;
  }
  const trackedState = loadWatchState(options.homeDir);
  const trackedEntry = watchEntryFromStartResult({
    issue: {
      number: issue.number,
      title: issue.title,
      url: issue.url,
      repo: issueRepo
    },
    session: {
      id: started.session_id,
      dir: started.session_dir,
      prompts_dir: started.prompts_dir,
      work_dir: started.work_dir,
      branch: desiredBranch,
      worktree: started.worktree,
      pid: started.pid
    },
    base_branch: baseBranch,
    pr,
    issue_comment_posted: issueCommentPosted,
    completion_state: completionState,
    pending_completion: pendingCompletion,
    warnings
  });
  setWatchEntry(trackedState, trackedEntry);
  saveWatchState(options.homeDir, trackedState);
  return {
    issue: {
      number: issue.number,
      title: issue.title,
      url: issue.url,
      repo: issueRepo
    },
    session: {
      id: started.session_id,
      dir: started.session_dir,
      prompts_dir: started.prompts_dir,
      work_dir: started.work_dir,
      branch: desiredBranch,
      worktree: started.worktree,
      pid: started.pid
    },
    base_branch: baseBranch,
    pr,
    issue_comment_posted: issueCommentPosted,
    completion_state: completionState,
    pending_completion: pendingCompletion,
    warnings
  };
}
function includesAloopTrackingLabel(targetLabels) {
  if (Array.isArray(targetLabels)) {
    return targetLabels.some((label) => label === "aloop" || label === "aloop/auto");
  }
  if (typeof targetLabels === "string") {
    return targetLabels.split(",").map((label) => label.trim()).some((label) => label === "aloop" || label === "aloop/auto");
  }
  return false;
}
function appendLog(sessionDir, entry) {
  const logFile = path10.join(sessionDir, "log.jsonl");
  const logData = JSON.stringify(entry) + String.fromCharCode(10);
  if (fs5.existsSync(sessionDir)) {
    fs5.appendFileSync(logFile, logData);
  } else {
    fs5.mkdirSync(sessionDir, { recursive: true });
    fs5.appendFileSync(logFile, logData);
  }
}
function requiresRequestFile(operation) {
  return operation !== "issue-comments" && operation !== "pr-comments";
}
function buildGhArgs(operation, payload, enforced) {
  const repo = enforced.repo;
  switch (operation) {
    case "pr-create": {
      const args = ["pr", "create", "--repo", repo, "--base", enforced.base];
      if (payload.title)
        args.push("--title", String(payload.title));
      if (payload.body)
        args.push("--body", String(payload.body));
      if (payload.head)
        args.push("--head", String(payload.head));
      if (Array.isArray(payload.labels)) {
        for (const label of payload.labels) {
          args.push("--label", String(label));
        }
      }
      return args;
    }
    case "pr-comment": {
      const prNum = enforced.pr_number ?? payload.pr_number;
      const args = ["pr", "comment", String(prNum), "--repo", repo];
      if (payload.body)
        args.push("--body", String(payload.body));
      return args;
    }
    case "issue-comment": {
      const issueNum = enforced.issue_number ?? payload.issue_number;
      const args = ["issue", "comment", String(issueNum), "--repo", repo];
      if (payload.body)
        args.push("--body", String(payload.body));
      return args;
    }
    case "issue-create": {
      const args = ["issue", "create", "--repo", repo];
      if (payload.title)
        args.push("--title", String(payload.title));
      if (payload.body)
        args.push("--body", String(payload.body));
      if (Array.isArray(payload.labels)) {
        for (const label of payload.labels) {
          args.push("--label", String(label));
        }
      }
      return args;
    }
    case "issue-close": {
      const issueNum = payload.issue_number;
      return ["issue", "close", String(issueNum), "--repo", repo];
    }
    case "issue-label": {
      const issueNum = enforced.issue_number ?? payload.issue_number;
      const action = enforced.label_action ?? payload.label_action;
      const label = enforced.label ?? payload.label;
      const args = ["issue", "edit", String(issueNum), "--repo", repo];
      if (action === "add") {
        args.push("--add-label", String(label));
      } else {
        args.push("--remove-label", String(label));
      }
      return args;
    }
    case "pr-merge": {
      const prNum = payload.pr_number;
      return ["pr", "merge", String(prNum), "--repo", repo, "--squash"];
    }
    case "issue-comments": {
      return ["api", `repos/${repo}/issues/comments`, "--method", "GET", "-f", `since=${String(enforced.since)}`];
    }
    case "pr-comments": {
      return ["api", `repos/${repo}/pulls/comments`, "--method", "GET", "-f", `since=${String(enforced.since)}`];
    }
    default:
      throw new Error(`Cannot build gh args for operation: ${operation}`);
  }
}
function parseGhOutput(operation, stdout) {
  const result = {};
  const trimmed = stdout.trim();
  if (operation === "pr-create") {
    const match = trimmed.match(/\/pull\/(\d+)/);
    if (match) {
      result.pr_number = parseInt(match[1], 10);
    }
    if (trimmed)
      result.url = trimmed;
  } else if (operation === "issue-create") {
    const match = trimmed.match(/\/issues\/(\d+)/);
    if (match) {
      result.issue_number = parseInt(match[1], 10);
    }
    if (trimmed)
      result.url = trimmed;
  } else if (operation === "issue-comments" || operation === "pr-comments") {
    const parsed = trimmed ? JSON.parse(trimmed) : [];
    const comments = Array.isArray(parsed) ? parsed : [];
    result.comments = comments;
    result.comment_count = comments.length;
  }
  return result;
}
async function executeGhOperation(operation, options) {
  const sessionDir = getSessionDir(options.homeDir, options.session);
  const requestFile = options.request;
  const needsRequestFile = requiresRequestFile(operation);
  const role = options.role;
  let sessionPolicy;
  const configFile = path10.join(sessionDir, "config.json");
  try {
    if (!fs5.existsSync(configFile)) {
      throw new Error(`Session config not found: ${configFile}`);
    }
    const configContent = fs5.readFileSync(configFile, "utf8");
    const config = JSON.parse(configContent);
    if (!config || typeof config.repo !== "string" || !config.repo.trim()) {
      throw new Error(`Invalid session config: missing or invalid 'repo' in ${configFile}`);
    }
    const assignedIssueNumber = parsePositiveInteger(config.issue_number);
    const childCreatedPrNumbers = Array.isArray(config.created_pr_numbers) ? config.created_pr_numbers.map((value) => parsePositiveInteger(value)).filter((value) => value !== void 0) : [];
    sessionPolicy = {
      repo: config.repo,
      assignedIssueNumber,
      childCreatedPrNumbers
    };
  } catch (e) {
    const timestamp2 = (/* @__PURE__ */ new Date()).toISOString();
    const logEntry = {
      timestamp: timestamp2,
      event: "gh_operation_denied",
      type: operation,
      session: options.session,
      role,
      reason: e.message
    };
    appendLog(sessionDir, logEntry);
    console.error(JSON.stringify(logEntry));
    process.exit(1);
  }
  let requestPayload = {};
  if (needsRequestFile) {
    if (typeof requestFile !== "string" || !requestFile.trim()) {
      console.error(`Request file not provided for operation: ${operation}`);
      process.exit(1);
    }
    if (fs5.existsSync(requestFile)) {
      try {
        requestPayload = JSON.parse(fs5.readFileSync(requestFile, "utf8"));
      } catch (e) {
        console.error(`Failed to parse request file: ${requestFile}`);
        process.exit(1);
      }
    } else {
      console.error(`Request file not found: ${requestFile}`);
      process.exit(1);
    }
  } else {
    requestPayload = {
      since: options.since
    };
  }
  const { allowed, reason, enforced } = evaluatePolicy(operation, role, requestPayload, sessionPolicy);
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const requestFileName = typeof requestFile === "string" ? path10.basename(requestFile) : void 0;
  if (!allowed) {
    const logEntry = {
      timestamp,
      event: "gh_operation_denied",
      type: operation,
      session: options.session,
      role,
      reason: reason || `${operation} not allowed for ${role} role`
    };
    appendLog(sessionDir, logEntry);
    console.error(JSON.stringify(logEntry));
    process.exit(1);
  } else {
    const ghArgs = buildGhArgs(operation, requestPayload, enforced);
    let ghResult;
    try {
      ghResult = await ghExecutor.exec(ghArgs);
    } catch (e) {
      const errorEntry = {
        timestamp,
        event: "gh_operation_error",
        type: operation,
        session: options.session,
        role,
        request_file: requestFileName,
        error: e.message,
        stderr: e.stderr || "",
        enforced
      };
      appendLog(sessionDir, errorEntry);
      console.error(JSON.stringify(errorEntry));
      process.exit(1);
    }
    let parsed = {};
    try {
      parsed = parseGhOutput(operation, ghResult.stdout);
    } catch (e) {
      const parseErrorEntry = {
        timestamp,
        event: "gh_operation_error",
        type: operation,
        session: options.session,
        role,
        error: e.message,
        stderr: ghResult.stderr || "",
        enforced
      };
      if (requestFileName) {
        parseErrorEntry.request_file = requestFileName;
      }
      appendLog(sessionDir, parseErrorEntry);
      console.error(JSON.stringify(parseErrorEntry));
      process.exit(1);
    }
    const logEntry = {
      timestamp,
      event: "gh_operation",
      type: operation,
      session: options.session,
      role,
      result: "success",
      enforced,
      ...parsed
    };
    if (requestFileName) {
      logEntry.request_file = requestFileName;
    }
    appendLog(sessionDir, logEntry);
    console.log(JSON.stringify(logEntry));
  }
}
function evaluatePolicy(operation, role, payload, sessionPolicy) {
  if (payload.repo && payload.repo !== sessionPolicy.repo) {
    return {
      allowed: false,
      reason: `Mismatched repo: requested ${payload.repo}, but session is bound to ${sessionPolicy.repo}`
    };
  }
  if (typeof payload.base === "string" && payload.base.trim().toLowerCase() === "main") {
    return { allowed: false, reason: "Operations targeting main are rejected; human must promote to main" };
  }
  if (role === "child-loop") {
    switch (operation) {
      case "pr-create":
        return {
          allowed: true,
          enforced: { base: "agent/trunk", repo: sessionPolicy.repo }
        };
      case "issue-comment": {
        const targetIssueNumber = parsePositiveInteger(payload.issue_number);
        if (targetIssueNumber === void 0) {
          return { allowed: false, reason: "Child issue-comment requires numeric issue_number" };
        }
        if (sessionPolicy.assignedIssueNumber === void 0) {
          return { allowed: false, reason: "Child session is missing assigned issue scope in config" };
        }
        if (targetIssueNumber !== sessionPolicy.assignedIssueNumber) {
          return {
            allowed: false,
            reason: `Child issue-comment must target assigned issue #${sessionPolicy.assignedIssueNumber}`
          };
        }
        return { allowed: true, enforced: { issue_number: sessionPolicy.assignedIssueNumber, repo: sessionPolicy.repo } };
      }
      case "pr-comment": {
        const targetPrNumber = parsePositiveInteger(payload.pr_number);
        if (targetPrNumber === void 0) {
          return { allowed: false, reason: "Child pr-comment requires numeric pr_number" };
        }
        if (!sessionPolicy.childCreatedPrNumbers.includes(targetPrNumber)) {
          return {
            allowed: false,
            reason: `Child pr-comment must target a PR created by this session (${targetPrNumber} is out of scope)`
          };
        }
        return { allowed: true, enforced: { pr_number: targetPrNumber, repo: sessionPolicy.repo } };
      }
      case "pr-merge":
      case "issue-create":
      case "issue-close":
      case "issue-label":
      case "issue-comments":
      case "pr-comments":
      case "branch-delete":
        return { allowed: false, reason: `${operation} not allowed for child-loop role` };
      default:
        return { allowed: false, reason: `Unknown operation: ${operation}` };
    }
  } else if (role === "orchestrator") {
    switch (operation) {
      case "issue-create":
        if (!includesAloopTrackingLabel(payload.labels)) {
          return { allowed: false, reason: "Must include aloop tracking label" };
        }
        return { allowed: true, enforced: { repo: sessionPolicy.repo } };
      case "issue-close":
        if (!includesAloopTrackingLabel(payload.target_labels)) {
          return { allowed: false, reason: "issue-close requires aloop-scoped target validation" };
        }
        return { allowed: true, enforced: { repo: sessionPolicy.repo } };
      case "pr-create":
        return { allowed: true, enforced: { base: "agent/trunk", repo: sessionPolicy.repo } };
      case "pr-merge":
        return { allowed: true, enforced: { base: "agent/trunk", merge_method: "squash", repo: sessionPolicy.repo } };
      case "issue-label": {
        if (!includesAloopTrackingLabel(payload.target_labels)) {
          return { allowed: false, reason: "issue-label requires aloop-scoped target validation" };
        }
        const issueNumber = parsePositiveInteger(payload.issue_number);
        if (issueNumber === void 0) {
          return { allowed: false, reason: "issue-label requires numeric issue_number" };
        }
        const action = payload.label_action;
        if (action !== "add" && action !== "remove") {
          return { allowed: false, reason: "issue-label requires label_action: add or remove" };
        }
        if (payload.label !== "aloop/blocked-on-human") {
          return { allowed: false, reason: "issue-label only permits aloop/blocked-on-human" };
        }
        return {
          allowed: true,
          enforced: {
            repo: sessionPolicy.repo,
            issue_number: issueNumber,
            label_action: action,
            label: "aloop/blocked-on-human"
          }
        };
      }
      case "issue-comments":
      case "pr-comments":
        if (typeof payload.since !== "string" || !payload.since.trim()) {
          return { allowed: false, reason: `${operation} requires --since timestamp` };
        }
        return { allowed: true, enforced: { repo: sessionPolicy.repo, since: payload.since.trim() } };
      case "pr-comment":
      case "issue-comment":
        if (!includesAloopTrackingLabel(payload.target_labels)) {
          return { allowed: false, reason: `${operation} requires aloop-scoped target validation` };
        }
        return { allowed: true, enforced: { repo: sessionPolicy.repo } };
      case "branch-delete":
        return { allowed: false, reason: "branch-delete rejected - cleanup is manual" };
      default:
        return { allowed: false, reason: `Unknown operation: ${operation}` };
    }
  }
  return { allowed: false, reason: `Unknown role: ${role}` };
}

// src/commands/setup.ts
import * as readline from "node:readline";

// src/commands/devcontainer.ts
import { readFile as readFile8, writeFile as writeFile8, mkdir as mkdir5 } from "node:fs/promises";
import { existsSync as existsSync9 } from "node:fs";
import { execFile as execFileCb } from "node:child_process";
import path11 from "node:path";
var defaultDeps2 = {
  discover: discoverWorkspace2,
  readFile: readFile8,
  writeFile: writeFile8,
  mkdir: mkdir5,
  existsSync: existsSync9
};
var RUNTIME_PROVIDERS = /* @__PURE__ */ new Set(["claude", "codex", "gemini", "copilot", "opencode"]);
function normalizeProviderList2(values) {
  const normalized = [];
  for (const value of values) {
    const candidate = value.trim().toLowerCase();
    if (!RUNTIME_PROVIDERS.has(candidate)) {
      continue;
    }
    if (!normalized.includes(candidate)) {
      normalized.push(candidate);
    }
  }
  return normalized;
}
function extractProviderList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const raw = value.filter((entry) => typeof entry === "string");
  return normalizeProviderList2(raw);
}
function resolveDevcontainerProviders(config, discoveredInstalledProviders) {
  const fallbackProviders = normalizeProviderList2(discoveredInstalledProviders);
  const enabledProviders = extractProviderList(config.enabled_providers);
  if (enabledProviders.length > 0) {
    return enabledProviders;
  }
  const roundRobinOrder = extractProviderList(config.round_robin_order);
  const configuredProvider = typeof config.provider === "string" ? config.provider.trim().toLowerCase() : "";
  if (configuredProvider === "round-robin") {
    if (roundRobinOrder.length > 0) {
      return roundRobinOrder;
    }
    return fallbackProviders;
  }
  if (RUNTIME_PROVIDERS.has(configuredProvider)) {
    return [configuredProvider];
  }
  if (fallbackProviders.length > 0) {
    return fallbackProviders;
  }
  return [];
}
async function resolveConfiguredProviders(discovery, deps) {
  const fallbackProviders = normalizeProviderList2(discovery.providers.installed);
  const configPath = discovery.setup.config_path;
  if (!deps.existsSync(configPath)) {
    return fallbackProviders;
  }
  const configContent = await deps.readFile(configPath, "utf8");
  const parsedConfig = parseYaml(configContent);
  return resolveDevcontainerProviders(parsedConfig, discovery.providers.installed);
}
function isDevcontainerDeps(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value;
  return typeof candidate.discover === "function" && typeof candidate.readFile === "function" && typeof candidate.writeFile === "function" && typeof candidate.mkdir === "function" && typeof candidate.existsSync === "function";
}
function resolveDevcontainerDeps(depsOrCommand, fallback = defaultDeps2) {
  return isDevcontainerDeps(depsOrCommand) ? depsOrCommand : fallback;
}
function getLanguageMapping(language, projectRoot, existsFn = existsSync9) {
  switch (language) {
    case "node-typescript":
      return {
        image: "mcr.microsoft.com/devcontainers/typescript-node:22",
        features: {
          "ghcr.io/devcontainers/features/git:1": {}
        },
        postCreateCommand: detectNodeInstallCommand(projectRoot, existsFn)
      };
    case "python":
      return {
        image: "mcr.microsoft.com/devcontainers/python:3",
        features: {
          "ghcr.io/devcontainers/features/git:1": {}
        },
        postCreateCommand: detectPythonInstallCommand(projectRoot, existsFn)
      };
    case "go":
      return {
        image: "mcr.microsoft.com/devcontainers/go:1",
        features: {
          "ghcr.io/devcontainers/features/git:1": {}
        },
        postCreateCommand: "go mod download"
      };
    case "rust":
      return {
        image: "mcr.microsoft.com/devcontainers/rust:1",
        features: {
          "ghcr.io/devcontainers/features/git:1": {}
        },
        postCreateCommand: "cargo build"
      };
    case "dotnet":
      return {
        image: "mcr.microsoft.com/devcontainers/dotnet:8.0",
        features: {
          "ghcr.io/devcontainers/features/git:1": {}
        },
        postCreateCommand: "dotnet restore"
      };
    default:
      return {
        image: "mcr.microsoft.com/devcontainers/base:ubuntu",
        features: {
          "ghcr.io/devcontainers/features/git:1": {},
          "ghcr.io/devcontainers/features/node:1": {}
        },
        postCreateCommand: null
      };
  }
}
function detectNodeInstallCommand(projectRoot, existsFn = existsSync9) {
  if (existsFn(path11.join(projectRoot, "pnpm-lock.yaml")))
    return "pnpm install";
  if (existsFn(path11.join(projectRoot, "yarn.lock")))
    return "yarn install";
  if (existsFn(path11.join(projectRoot, "bun.lockb")) || existsFn(path11.join(projectRoot, "bun.lock")))
    return "bun install";
  return "npm install";
}
function detectPythonInstallCommand(projectRoot, existsFn = existsSync9) {
  if (existsFn(path11.join(projectRoot, "pyproject.toml")))
    return "pip install -e .";
  if (existsFn(path11.join(projectRoot, "requirements.txt")))
    return "pip install -r requirements.txt";
  return "pip install -e .";
}
var PROVIDER_INSTALL_COMMANDS = {
  claude: "npm install -g @anthropic-ai/claude-code",
  codex: "npm install -g @openai/codex",
  gemini: "npm install -g @google/gemini-cli",
  opencode: "npm install -g opencode"
};
var PROVIDER_AUTH_ENV_VARS = {
  claude: ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY"],
  codex: ["OPENAI_API_KEY"],
  gemini: ["GEMINI_API_KEY"],
  opencode: ["OPENCODE_API_KEY"],
  copilot: ["GH_TOKEN"]
};
var PROVIDER_AUTH_GUIDANCE = {
  claude: "Run `claude setup-token` to generate a headless OAuth token (requires Pro/Max subscription), or set ANTHROPIC_API_KEY from https://console.anthropic.com/",
  codex: "Set OPENAI_API_KEY from https://platform.openai.com/api-keys",
  gemini: "Set GEMINI_API_KEY from https://aistudio.google.com/apikey",
  opencode: "Set OPENCODE_API_KEY for your configured backend provider",
  copilot: "Set GH_TOKEN via `gh auth token` or from https://github.com/settings/tokens"
};
var PROVIDER_AUTH_FILES = {
  claude: [".claude/.credentials.json"],
  opencode: [".local/share/opencode/auth.json"],
  codex: [".codex/auth.json"],
  copilot: [".copilot/config.json"],
  gemini: [".gemini/oauth_creds.json", ".gemini/google_accounts.json"]
};
function getProposedAuthMethod(provider, strategy) {
  const envVars = PROVIDER_AUTH_ENV_VARS[provider] || [];
  const files = PROVIDER_AUTH_FILES[provider] || [];
  if (strategy === "env-only") {
    return `Env vars: ${envVars.join(", ")}`;
  }
  if (strategy === "env-first") {
    if (envVars.length > 0) {
      return `Env vars: ${envVars.join(", ")}${files.length > 0 ? ` (fallback: mount ${files.join(", ")})` : ""}`;
    }
  }
  if (files.length > 0) {
    return `Mount: ${files.join(", ")}${envVars.length > 0 ? ` (fallback: env vars ${envVars.join(", ")})` : ""}`;
  }
  return envVars.length > 0 ? `Env vars: ${envVars.join(", ")}` : "No known auth method";
}
function checkAuthPreflight(providers, env = process.env, existsFn, homeDir) {
  const resolvedHome = homeDir ?? env.HOME ?? env.USERPROFILE ?? "/root";
  const warnings = [];
  for (const provider of providers) {
    const authVars = PROVIDER_AUTH_ENV_VARS[provider];
    if (!authVars || authVars.length === 0)
      continue;
    const anySet = authVars.some((v) => env[v] && env[v].length > 0);
    if (anySet)
      continue;
    const authFiles = PROVIDER_AUTH_FILES[provider];
    if (existsFn && authFiles && authFiles.length > 0) {
      const anyFileExists = authFiles.some((relPath) => {
        const hostPath = resolveHomePath(relPath, resolvedHome);
        return existsFn(hostPath);
      });
      if (anyFileExists)
        continue;
    }
    warnings.push({
      provider,
      missingVars: authVars,
      guidance: PROVIDER_AUTH_GUIDANCE[provider] || `Set one of: ${authVars.join(", ")}`
    });
  }
  return warnings;
}
function buildProviderInstallCommands(installedProviders) {
  const commands = [];
  for (const provider of installedProviders) {
    const cmd = PROVIDER_INSTALL_COMMANDS[provider];
    if (cmd) {
      commands.push(cmd);
    }
  }
  return commands;
}
function buildProviderRemoteEnv(installedProviders, strategy = "mount-first") {
  const env = {};
  for (const provider of installedProviders) {
    const vars = PROVIDER_AUTH_ENV_VARS[provider];
    if (vars) {
      for (const v of vars) {
        env[v] = `\${localEnv:${v}}`;
      }
    }
  }
  return env;
}
function resolveHomePath(filePath, homeDir) {
  if (path11.isAbsolute(filePath)) {
    return filePath;
  }
  const cleaned = filePath.startsWith("~/") ? filePath.slice(2) : filePath === "~" ? "" : filePath;
  return path11.join(homeDir, cleaned);
}
function buildProviderAuthFileMounts(providers, strategy = "mount-first", env = process.env, existsFn = existsSync9, homeDir) {
  if (strategy === "env-only")
    return [];
  const resolvedHome = homeDir ?? env.HOME ?? env.USERPROFILE ?? "/root";
  const mounts = [];
  for (const provider of providers) {
    const authVars = PROVIDER_AUTH_ENV_VARS[provider];
    const authFiles = PROVIDER_AUTH_FILES[provider];
    if (!authFiles || authFiles.length === 0)
      continue;
    if (strategy === "env-first") {
      const anyEnvSet = authVars?.some((v) => env[v] && env[v].length > 0);
      if (anyEnvSet)
        continue;
    }
    for (const relPath of authFiles) {
      const hostPath = resolveHomePath(relPath, resolvedHome);
      if (existsFn(hostPath)) {
        const containerPath = `\${containerEnv:HOME}/${relPath}`;
        mounts.push(`source=${hostPath},target=${containerPath},type=bind`);
      }
    }
  }
  return mounts;
}
var PROVIDER_VSCODE_EXTENSIONS = {
  claude: "anthropic.claude-code",
  copilot: "GitHub.copilot"
};
function buildVSCodeExtensions(installedProviders) {
  const extensions = [];
  for (const provider of installedProviders) {
    const ext = PROVIDER_VSCODE_EXTENSIONS[provider];
    if (ext) {
      extensions.push(ext);
    }
  }
  return extensions;
}
function buildAloopMounts() {
  return [
    "source=${localWorkspaceFolder}/.aloop,target=${containerWorkspaceFolder}/.aloop,type=bind",
    "source=${localEnv:HOME}/.aloop/sessions,target=/aloop-sessions,type=bind"
  ];
}
function buildAloopContainerEnv() {
  return {
    ALOOP_NO_DASHBOARD: "1",
    ALOOP_CONTAINER: "1"
  };
}
function generateDevcontainerConfig(discovery, existsFn = existsSync9, configuredProviders, env = process.env, homeDir, authStrategy = "mount-first") {
  const projectRoot = discovery.project.root;
  const projectName = discovery.project.name;
  const language = discovery.context.detected_language;
  const mapping = getLanguageMapping(language, projectRoot, existsFn);
  const installedProviders = configuredProviders ?? discovery.providers.installed;
  const providerInstalls = buildProviderInstallCommands(installedProviders);
  const allCommands = [
    ...mapping.postCreateCommand ? [mapping.postCreateCommand] : [],
    ...providerInstalls
  ];
  const authFileMounts = buildProviderAuthFileMounts(installedProviders, authStrategy, env, existsFn, homeDir);
  const config = {
    name: `${projectName}-aloop`,
    image: mapping.image,
    features: { ...mapping.features },
    mounts: [...buildAloopMounts(), ...authFileMounts],
    containerEnv: buildAloopContainerEnv(),
    remoteEnv: buildProviderRemoteEnv(installedProviders, authStrategy)
  };
  const vscodeExtensions = buildVSCodeExtensions(installedProviders);
  if (vscodeExtensions.length > 0) {
    config.customizations = {
      vscode: {
        extensions: vscodeExtensions
      }
    };
  }
  if (allCommands.length > 0) {
    config.postCreateCommand = allCommands.join(" && ");
  }
  return config;
}
function mergeArrayUnique(existing, additions) {
  const result = [...existing];
  for (const item of additions) {
    if (!result.includes(item)) {
      result.push(item);
    }
  }
  return result;
}
function augmentExistingConfig(existing, generated) {
  const result = { ...existing };
  const existingMounts = Array.isArray(result.mounts) ? result.mounts : [];
  result.mounts = mergeArrayUnique(existingMounts, generated.mounts);
  const existingContainerEnv = result.containerEnv ?? {};
  result.containerEnv = { ...existingContainerEnv, ...generated.containerEnv };
  const existingRemoteEnv = result.remoteEnv ?? {};
  result.remoteEnv = { ...generated.remoteEnv, ...existingRemoteEnv };
  if (generated.customizations) {
    const existingCustomizations = result.customizations ?? {};
    const merged = { ...existingCustomizations };
    for (const [key, value] of Object.entries(generated.customizations)) {
      if (key === "vscode" && typeof value === "object" && value !== null) {
        const vscodeVal = value;
        const existingVscode = merged.vscode ?? {};
        if (vscodeVal.extensions && Array.isArray(vscodeVal.extensions)) {
          const existingExts = Array.isArray(existingVscode.extensions) ? existingVscode.extensions : [];
          merged.vscode = { ...existingVscode, extensions: mergeArrayUnique(existingExts, vscodeVal.extensions) };
        }
      } else if (!(key in merged)) {
        merged[key] = value;
      }
    }
    result.customizations = merged;
  }
  return result;
}
function stripJsoncComments(raw) {
  let result = "";
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '"') {
      result += ch;
      i++;
      while (i < raw.length) {
        const sc = raw[i];
        result += sc;
        i++;
        if (sc === "\\") {
          if (i < raw.length) {
            result += raw[i];
            i++;
          }
        } else if (sc === '"') {
          break;
        }
      }
      continue;
    }
    if (ch === "/" && i + 1 < raw.length && raw[i + 1] === "/") {
      i += 2;
      while (i < raw.length && raw[i] !== "\n") {
        i++;
      }
      continue;
    }
    if (ch === "/" && i + 1 < raw.length && raw[i + 1] === "*") {
      i += 2;
      while (i < raw.length) {
        if (raw[i] === "*" && i + 1 < raw.length && raw[i + 1] === "/") {
          i += 2;
          break;
        }
        i++;
      }
      continue;
    }
    result += ch;
    i++;
  }
  return result;
}
async function devcontainerCommandWithDeps(options = {}, deps = defaultDeps2) {
  const discovery = await deps.discover({
    projectRoot: options.projectRoot,
    homeDir: options.homeDir
  });
  const projectRoot = discovery.project.root;
  const devcontainerDir = path11.join(projectRoot, ".devcontainer");
  const configPath = path11.join(devcontainerDir, "devcontainer.json");
  const hadExisting = deps.existsSync(configPath);
  const resolvedProviders = await resolveConfiguredProviders(discovery, deps);
  let authStrategy = "mount-first";
  const projectConfigPath = discovery.setup.config_path;
  if (deps.existsSync(projectConfigPath)) {
    try {
      const content = await deps.readFile(projectConfigPath, "utf8");
      const parsed = parseYaml(content);
      if (parsed.devcontainer_auth_strategy === "env-first" || parsed.devcontainer_auth_strategy === "env-only") {
        authStrategy = parsed.devcontainer_auth_strategy;
      }
    } catch {
    }
  }
  const hostHome = options.homeDir ?? process.env.HOME ?? process.env.USERPROFILE;
  const generated = generateDevcontainerConfig(discovery, deps.existsSync, resolvedProviders, process.env, hostHome, authStrategy);
  let finalConfig;
  let action;
  if (hadExisting) {
    const raw = await deps.readFile(configPath, "utf8");
    const stripped = stripJsoncComments(raw);
    const existing = JSON.parse(stripped);
    finalConfig = augmentExistingConfig(existing, generated);
    action = "augmented";
  } else {
    finalConfig = generated;
    action = "created";
  }
  await deps.mkdir(devcontainerDir, { recursive: true });
  await deps.writeFile(configPath, JSON.stringify(finalConfig, null, 2) + "\n", "utf8");
  const mapping = getLanguageMapping(discovery.context.detected_language, projectRoot, deps.existsSync);
  const authWarnings = checkAuthPreflight(resolvedProviders, process.env, deps.existsSync, hostHome);
  return {
    action,
    config_path: configPath,
    language: discovery.context.detected_language,
    image: mapping.image,
    features: Object.keys(generated.features),
    post_create_command: generated.postCreateCommand ?? null,
    mounts: generated.mounts,
    had_existing: hadExisting,
    vscode_extensions: buildVSCodeExtensions(resolvedProviders),
    auth_warnings: authWarnings
  };
}
function execFilePromise(command, args, options) {
  return new Promise((resolve2) => {
    execFileCb(command, args, { cwd: options?.cwd, timeout: options?.timeout ?? 12e4 }, (error, stdout, stderr) => {
      const exitCode = error && "code" in error && typeof error.code === "number" ? error.code : error ? 1 : 0;
      resolve2({ stdout: String(stdout), stderr: String(stderr), exitCode });
    });
  });
}
var defaultVerifyDeps = {
  exec: execFilePromise,
  existsSync: existsSync9,
  readFile: readFile8
};
var PROVIDER_CLI_BINARIES = {
  claude: "claude",
  codex: "codex",
  gemini: "gemini",
  opencode: "opencode"
};
async function execCheck(deps, projectRoot, name, containerArgs) {
  const result = await deps.exec("devcontainer", [
    "exec",
    "--workspace-folder",
    projectRoot,
    "--",
    ...containerArgs
  ], { cwd: projectRoot, timeout: 3e4 });
  return {
    name,
    passed: result.exitCode === 0,
    message: result.exitCode === 0 ? `${name}: OK` : `${name}: FAILED \u2014 ${(result.stderr || result.stdout).trim().split("\n")[0] || "non-zero exit"}`
  };
}
async function verifyDevcontainer(projectRoot, providers, deps = defaultVerifyDeps, maxIterations = 1) {
  const configPath = path11.join(projectRoot, ".devcontainer", "devcontainer.json");
  if (!deps.existsSync(configPath)) {
    return {
      passed: false,
      checks: [{ name: "config-exists", passed: false, message: "config-exists: FAILED \u2014 .devcontainer/devcontainer.json not found" }],
      iteration: 0
    };
  }
  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const checks = [];
    const buildResult = await deps.exec("devcontainer", [
      "build",
      "--workspace-folder",
      projectRoot
    ], { cwd: projectRoot, timeout: 3e5 });
    checks.push({
      name: "build",
      passed: buildResult.exitCode === 0,
      message: buildResult.exitCode === 0 ? "build: OK" : `build: FAILED \u2014 ${(buildResult.stderr || buildResult.stdout).trim().split("\n")[0] || "non-zero exit"}`
    });
    if (buildResult.exitCode !== 0) {
      return { passed: false, checks, iteration };
    }
    const upResult = await deps.exec("devcontainer", [
      "up",
      "--workspace-folder",
      projectRoot
    ], { cwd: projectRoot, timeout: 3e5 });
    checks.push({
      name: "up",
      passed: upResult.exitCode === 0,
      message: upResult.exitCode === 0 ? "up: OK" : `up: FAILED \u2014 ${(upResult.stderr || upResult.stdout).trim().split("\n")[0] || "non-zero exit"}`
    });
    if (upResult.exitCode !== 0) {
      return { passed: false, checks, iteration };
    }
    checks.push(await execCheck(deps, projectRoot, "git", ["git", "status"]));
    checks.push(await execCheck(deps, projectRoot, "aloop-mount", ["test", "-d", ".aloop"]));
    checks.push(await execCheck(deps, projectRoot, "sessions-mount", ["test", "-d", "/aloop-sessions"]));
    for (const provider of providers) {
      const binary = PROVIDER_CLI_BINARIES[provider];
      if (binary) {
        checks.push(await execCheck(deps, projectRoot, `provider-${provider}`, ["which", binary]));
      }
    }
    for (const provider of providers) {
      const authVars = PROVIDER_AUTH_ENV_VARS[provider];
      if (authVars && authVars.length > 0) {
        const varChecks = await Promise.all(
          authVars.map((v) => execCheck(deps, projectRoot, `auth-${provider}-${v}`, ["sh", "-c", `test -n "$${v}"`]))
        );
        const anyAuthSet = varChecks.some((c) => c.passed);
        checks.push({
          name: `auth-${provider}`,
          passed: anyAuthSet,
          message: anyAuthSet ? `auth-${provider}: OK (${authVars.find((_, i) => varChecks[i].passed)} is set)` : `auth-${provider}: FAILED \u2014 none of [${authVars.join(", ")}] are set inside container`
        });
      }
    }
    const raw = await deps.readFile(configPath, "utf8");
    const stripped = stripJsoncComments(raw);
    const config = JSON.parse(stripped);
    const image = config.image || "";
    if (image.includes("typescript-node") || image.includes("node:")) {
      checks.push(await execCheck(deps, projectRoot, "deps-installed", ["test", "-d", "node_modules"]));
    } else if (image.includes("python")) {
      checks.push(await execCheck(deps, projectRoot, "deps-installed", ["python", "-c", 'print("ok")']));
    } else if (image.includes("go")) {
      checks.push(await execCheck(deps, projectRoot, "deps-installed", ["go", "version"]));
    } else if (image.includes("rust")) {
      checks.push(await execCheck(deps, projectRoot, "deps-installed", ["cargo", "--version"]));
    } else if (image.includes("dotnet")) {
      checks.push(await execCheck(deps, projectRoot, "deps-installed", ["dotnet", "--version"]));
    }
    const allPassed = checks.every((c) => c.passed);
    if (allPassed || iteration === maxIterations) {
      return { passed: allPassed, checks, iteration };
    }
  }
  return { passed: false, checks: [], iteration: maxIterations };
}
async function verifyDevcontainerCommand(options = {}, depsOrCommand, verifyDepsOverride) {
  const deps = resolveDevcontainerDeps(depsOrCommand, defaultDeps2);
  const discovery = await deps.discover({
    projectRoot: options.projectRoot,
    homeDir: options.homeDir
  });
  const projectRoot = discovery.project.root;
  const providers = await resolveConfiguredProviders(discovery, deps);
  const vDeps = verifyDepsOverride ?? defaultVerifyDeps;
  const result = await verifyDevcontainer(projectRoot, providers, vDeps);
  const outputMode = options.output || "text";
  if (outputMode === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Devcontainer verification (iteration ${result.iteration}):`);
  for (const check of result.checks) {
    const icon = check.passed ? "[PASS]" : "[FAIL]";
    console.log(`  ${icon} ${check.message}`);
  }
  console.log("");
  if (result.passed) {
    console.log("All checks passed. Container is ready for aloop.");
  } else {
    console.log("Some checks failed. Review the output above and fix .devcontainer/devcontainer.json.");
  }
}
async function devcontainerCommand(options = {}, depsOrCommand) {
  const deps = resolveDevcontainerDeps(depsOrCommand, defaultDeps2);
  const result = await devcontainerCommandWithDeps(options, deps);
  const outputMode = options.output || "text";
  if (outputMode === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (result.action === "augmented") {
    console.log(`Augmented existing devcontainer config at ${result.config_path}`);
    console.log("Added aloop mounts and environment variables.");
  } else {
    console.log(`Created devcontainer config at ${result.config_path}`);
    console.log(`  Language: ${result.language}`);
    console.log(`  Image: ${result.image}`);
    if (result.post_create_command) {
      console.log(`  Post-create: ${result.post_create_command}`);
    }
  }
  if (result.auth_warnings.length > 0) {
    console.log("");
    console.log("Auth warnings:");
    for (const warning of result.auth_warnings) {
      console.log(`  [WARN] ${warning.provider}: none of [${warning.missingVars.join(", ")}] are set on the host.`);
      console.log(`         ${warning.guidance}`);
    }
  }
  console.log("");
  console.log("Next steps:");
  console.log("  1. Review .devcontainer/devcontainer.json");
  console.log("  2. Run `devcontainer build --workspace-folder .` to verify");
  console.log("  3. Start a loop with `aloop start` \u2014 container will be used automatically");
}

// src/commands/setup.ts
function parseDataPrivacy(value) {
  if (!value)
    return void 0;
  const normalized = value.trim().toLowerCase();
  if (normalized === "private" || normalized === "public") {
    return normalized;
  }
  throw new Error(`Invalid data privacy: ${value} (must be private or public)`);
}
function parseDevcontainerAuthStrategy(value) {
  if (!value)
    return void 0;
  const normalized = value.trim().toLowerCase();
  if (normalized === "mount-first" || normalized === "env-first" || normalized === "env-only") {
    return normalized;
  }
  throw new Error(`Invalid devcontainer auth strategy: ${value} (must be mount-first, env-first, or env-only)`);
}
function parseAutonomyLevel(value) {
  if (!value)
    return void 0;
  const normalized = value.trim().toLowerCase();
  if (normalized === "cautious" || normalized === "balanced" || normalized === "autonomous") {
    return normalized;
  }
  throw new Error(`Invalid autonomy level: ${value} (must be cautious, balanced, or autonomous)`);
}
function parseSetupMode(value) {
  if (!value)
    return void 0;
  const normalized = value.trim().toLowerCase();
  if (normalized === "loop" || normalized === "orchestrate") {
    return normalized;
  }
  throw new Error(`Invalid setup mode: ${value} (must be loop or orchestrate)`);
}
function mapSetupModeToLoopMode(value) {
  if (!value)
    return void 0;
  if (value === "orchestrate") {
    return "orchestrate";
  }
  return "plan-build-review";
}
async function defaultPromptUser(rl, question, defaultValue) {
  return new Promise((resolve2) => {
    rl.question(`${question} [${defaultValue}]: `, (answer) => {
      resolve2(answer.trim() || defaultValue);
    });
  });
}
async function setupCommandWithDeps(options, deps) {
  const discovery = await deps.discover({
    projectRoot: options.projectRoot,
    homeDir: options.homeDir
  });
  if (options.nonInteractive) {
    console.log("Running setup in non-interactive mode...");
    const setupMode = parseSetupMode(options.mode);
    const result2 = await deps.scaffold({
      projectRoot: options.projectRoot,
      homeDir: options.homeDir,
      specFiles: options.spec ? [options.spec] : void 0,
      enabledProviders: options.providers ? options.providers.split(",").map((p) => p.trim()) : void 0,
      mode: mapSetupModeToLoopMode(setupMode),
      autonomyLevel: parseAutonomyLevel(options.autonomyLevel),
      dataPrivacy: parseDataPrivacy(options.dataPrivacy),
      devcontainerAuthStrategy: parseDevcontainerAuthStrategy(options.devcontainerAuthStrategy)
    });
    console.log(`Setup complete. Config written to: ${result2.config_path}`);
    return;
  }
  console.log("\n--- Aloop Interactive Setup ---\n");
  const defaultSpec = options.spec || discovery.context.spec_candidates[0] || "SPEC.md";
  const spec = await deps.prompt("Spec File", defaultSpec);
  const defaultProviders = options.providers || discovery.providers.installed.join(",") || "claude";
  const providersRaw = await deps.prompt("Enabled Providers (comma-separated)", defaultProviders);
  const enabledProviders = providersRaw.split(",").map((s) => s.trim()).filter(Boolean);
  const defaultLanguage = discovery.context.detected_language;
  const language = await deps.prompt("Language", defaultLanguage);
  const defaultProvider = enabledProviders[0] || discovery.providers.default_provider;
  const provider = await deps.prompt("Primary Provider", defaultProvider);
  const recommendedMode = discovery.mode_recommendation?.recommended_mode;
  const recommendationReasons = discovery.mode_recommendation?.reasoning || [];
  if (recommendedMode && recommendationReasons.length > 0) {
    console.log("\n  Mode recommendation:");
    for (const reason of recommendationReasons) {
      console.log(`    ${reason}`);
    }
    console.log("");
  }
  const defaultMode = recommendedMode === "orchestrate" ? "orchestrate" : "plan-build-review";
  const mode = await deps.prompt("Mode", defaultMode);
  const defaultAutonomyLevel = options.autonomyLevel ?? "balanced";
  const autonomyLevel = parseAutonomyLevel(
    await deps.prompt("Autonomy Level (cautious|balanced|autonomous)", defaultAutonomyLevel)
  ) ?? "balanced";
  const defaultDataPrivacy = "private";
  const dataPrivacy = parseDataPrivacy(
    await deps.prompt("Data Privacy (private|public)", options.dataPrivacy ?? defaultDataPrivacy)
  ) ?? "private";
  let devcontainerAuthStrategy;
  if (discovery.devcontainer.enabled) {
    const defaultStrategy = options.devcontainerAuthStrategy ?? "mount-first";
    devcontainerAuthStrategy = parseDevcontainerAuthStrategy(
      await deps.prompt("Devcontainer Auth Strategy (mount-first|env-first|env-only)", defaultStrategy)
    ) ?? "mount-first";
  }
  const defaultValidation = discovery.context.validation_presets.full.join(", ") || "npm test";
  const validationCommandsRaw = await deps.prompt("Validation Commands (comma-separated)", defaultValidation);
  const validationCommands = validationCommandsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  const defaultSafety = "Never delete the project directory or run destructive commands, Never push to remote without explicit user approval";
  const safetyRulesRaw = await deps.prompt("Safety Rules (comma-separated)", defaultSafety);
  const safetyRules = safetyRulesRaw.split(",").map((s) => s.trim()).filter(Boolean);
  console.log("\nScaffolding workspace with the following configuration:");
  console.log(`- Spec: ${spec}`);
  console.log(`- Providers: ${enabledProviders.join(", ")}`);
  console.log(`- Language: ${language}`);
  console.log(`- Primary Provider: ${provider}`);
  console.log(`- Mode: ${mode}`);
  console.log(`- Autonomy Level: ${autonomyLevel}`);
  console.log(`- Data Privacy: ${dataPrivacy}`);
  console.log(`- ZDR Mode: ${dataPrivacy === "private" ? "Enabled" : "Disabled"}`);
  if (mode === "orchestrate") {
    console.log("- Trunk Branch: agent/trunk");
  }
  if (discovery.devcontainer.enabled) {
    console.log(`- Devcontainer Auth Strategy: ${devcontainerAuthStrategy}`);
    console.log("- Proposed Provider Auth:");
    for (const p of enabledProviders) {
      console.log(`    ${p}: ${getProposedAuthMethod(p, devcontainerAuthStrategy)}`);
    }
  }
  console.log(`- Validation Commands: ${validationCommands.join(", ")}`);
  console.log(`- Safety Rules: ${safetyRules.join(", ")}`);
  console.log("");
  const result = await deps.scaffold({
    projectRoot: options.projectRoot,
    homeDir: options.homeDir,
    specFiles: [spec],
    enabledProviders,
    language,
    provider,
    mode,
    autonomyLevel,
    dataPrivacy,
    devcontainerAuthStrategy,
    validationCommands,
    safetyRules
  });
  console.log(`Setup complete. Config written to: ${result.config_path}`);
}
async function setupCommand(options = {}) {
  let rl = null;
  const deps = {
    discover: discoverWorkspace2,
    scaffold: scaffoldWorkspace2,
    prompt: async (question, defaultValue) => {
      if (!rl) {
        rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
      }
      return defaultPromptUser(rl, question, defaultValue);
    }
  };
  try {
    await setupCommandWithDeps(options, deps);
  } finally {
    if (rl) {
      rl.close();
    }
  }
}

// src/commands/update.ts
import fs6 from "node:fs";
import fsp from "node:fs/promises";
import path12 from "node:path";
import os5 from "node:os";
import { spawnSync as spawnSync6 } from "node:child_process";
var defaultDeps3 = {
  homeDir: () => os5.homedir(),
  existsSync: fs6.existsSync,
  readdir: fsp.readdir,
  mkdir: fsp.mkdir,
  copyFile: fsp.copyFile,
  writeFile: fsp.writeFile,
  chmod: fsp.chmod,
  spawnSync: spawnSync6
};
async function copyTree(src, dest, deps) {
  const written = [];
  if (!deps.existsSync(src))
    return written;
  const stat2 = fs6.statSync(src);
  if (!stat2.isDirectory()) {
    await deps.mkdir(path12.dirname(dest), { recursive: true });
    await deps.copyFile(src, dest);
    written.push(dest);
    return written;
  }
  const entries = await deps.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path12.join(src, entry.name);
    const destPath = path12.join(dest, entry.name);
    if (entry.isDirectory()) {
      const sub = await copyTree(srcPath, destPath, deps);
      written.push(...sub);
    } else {
      await deps.mkdir(path12.dirname(destPath), { recursive: true });
      await deps.copyFile(srcPath, destPath);
      written.push(destPath);
    }
  }
  return written;
}
function findRepoRoot(startDir, deps) {
  let dir = path12.resolve(startDir);
  const root = path12.parse(dir).root;
  while (dir !== root) {
    if (deps.existsSync(path12.join(dir, "install.ps1")) && deps.existsSync(path12.join(dir, "aloop", "bin"))) {
      return dir;
    }
    const parent = path12.dirname(dir);
    if (parent === dir)
      break;
    dir = parent;
  }
  return null;
}
async function executeUpdate(options = {}, deps = defaultDeps3) {
  const homeDir = options.homeDir || deps.homeDir();
  const aloopDir = path12.join(homeDir, ".aloop");
  const repoRoot = options.repoRoot ? path12.resolve(options.repoRoot) : findRepoRoot(process.cwd(), deps);
  if (!repoRoot) {
    return {
      success: false,
      repoRoot: "",
      aloopDir,
      commit: "",
      installedAt: "",
      updated: [],
      errors: ["Could not find aloop source repository. Run from within the repo or use --repo-root."]
    };
  }
  const requiredPaths = ["aloop/bin", "aloop/cli", "aloop/templates"];
  const missing = requiredPaths.filter((p) => !deps.existsSync(path12.join(repoRoot, p)));
  if (missing.length > 0) {
    return {
      success: false,
      repoRoot,
      aloopDir,
      commit: "",
      installedAt: "",
      updated: [],
      errors: [`Missing expected directories in repo: ${missing.join(", ")}`]
    };
  }
  const updated = [];
  const errors = [];
  try {
    const binFiles = await copyTree(
      path12.join(repoRoot, "aloop", "bin"),
      path12.join(aloopDir, "bin"),
      deps
    );
    updated.push(...binFiles);
    if (os5.platform() !== "win32") {
      for (const f of binFiles) {
        if (f.endsWith(".sh") || !path12.basename(f).includes(".")) {
          await deps.chmod(f, 493);
        }
      }
    }
  } catch (e) {
    errors.push(`bin: ${e.message}`);
  }
  try {
    const configSrc = path12.join(repoRoot, "aloop", "config.yml");
    const configDest = path12.join(aloopDir, "config.yml");
    if (deps.existsSync(configSrc)) {
      await deps.mkdir(path12.dirname(configDest), { recursive: true });
      await deps.copyFile(configSrc, configDest);
      updated.push(configDest);
    }
  } catch (e) {
    errors.push(`config: ${e.message}`);
  }
  try {
    const tmplFiles = await copyTree(
      path12.join(repoRoot, "aloop", "templates"),
      path12.join(aloopDir, "templates"),
      deps
    );
    updated.push(...tmplFiles);
  } catch (e) {
    errors.push(`templates: ${e.message}`);
  }
  try {
    const distFiles = await copyTree(
      path12.join(repoRoot, "aloop", "cli", "dist"),
      path12.join(aloopDir, "cli", "dist"),
      deps
    );
    updated.push(...distFiles);
  } catch (e) {
    errors.push(`cli/dist: ${e.message}`);
  }
  try {
    const libFiles = await copyTree(
      path12.join(repoRoot, "aloop", "cli", "lib"),
      path12.join(aloopDir, "cli", "lib"),
      deps
    );
    updated.push(...libFiles);
  } catch (e) {
    errors.push(`cli/lib: ${e.message}`);
  }
  try {
    const entrySrc = path12.join(repoRoot, "aloop", "cli", "aloop.mjs");
    const entryDest = path12.join(aloopDir, "cli", "aloop.mjs");
    if (deps.existsSync(entrySrc)) {
      await deps.mkdir(path12.dirname(entryDest), { recursive: true });
      await deps.copyFile(entrySrc, entryDest);
      updated.push(entryDest);
    }
  } catch (e) {
    errors.push(`cli/aloop.mjs: ${e.message}`);
  }
  try {
    const binDir = path12.join(aloopDir, "bin");
    await deps.mkdir(binDir, { recursive: true });
    const cmdShimPath = path12.join(binDir, "aloop.cmd");
    const cmdShimContent = '@echo off\nnode "%~dp0..\\cli\\aloop.mjs" %*\n';
    await deps.writeFile(cmdShimPath, cmdShimContent, "utf8");
    updated.push(cmdShimPath);
    const shShimPath = path12.join(binDir, "aloop");
    const shShimContent = '#!/bin/sh\nexec node "$(dirname "$0")/../cli/aloop.mjs" "$@"\n';
    await deps.writeFile(shShimPath, shShimContent, "utf8");
    updated.push(shShimPath);
    if (os5.platform() !== "win32") {
      await deps.chmod(shShimPath, 493);
    }
  } catch (e) {
    errors.push(`shims: ${e.message}`);
  }
  for (const sub of ["projects", "sessions"]) {
    const dir = path12.join(aloopDir, sub);
    try {
      await deps.mkdir(dir, { recursive: true });
    } catch {
    }
  }
  let commit = "";
  const installedAt = (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
  try {
    const gitResult = deps.spawnSync("git", ["-C", repoRoot, "rev-parse", "--short", "HEAD"], {
      encoding: "utf8"
    });
    if (gitResult.status === 0) {
      commit = gitResult.stdout.trim();
    }
  } catch {
  }
  const versionJson = JSON.stringify({ commit, installed_at: installedAt });
  try {
    await deps.writeFile(path12.join(aloopDir, "version.json"), versionJson, "utf8");
  } catch (e) {
    errors.push(`version.json: ${e.message}`);
  }
  return {
    success: errors.length === 0,
    repoRoot,
    aloopDir,
    commit,
    installedAt,
    updated,
    errors
  };
}
async function updateCommand(options = {}) {
  const outputMode = options.output || "text";
  const result = await executeUpdate(options);
  if (outputMode === "json") {
    console.log(JSON.stringify(result, null, 2));
    if (!result.success)
      process.exit(1);
    return;
  }
  if (!result.success) {
    for (const err of result.errors) {
      console.error(`Error: ${err}`);
    }
    process.exit(1);
  }
  const versionLabel = result.commit ? `${result.commit} (${result.installedAt})` : result.installedAt;
  console.log(`Updated ~/.aloop from ${result.repoRoot}`);
  console.log(`Version: ${versionLabel}`);
  console.log(`Files updated: ${result.updated.length}`);
}

// src/commands/orchestrate.ts
import { mkdir as mkdir7, readFile as readFile10, readdir as readdir5, unlink as unlink2, writeFile as writeFile10 } from "node:fs/promises";
import { existsSync as existsSync11, readdirSync } from "node:fs";
import path14 from "node:path";

// src/lib/github-monitor.ts
import { existsSync as existsSync10 } from "node:fs";
import { readFile as readFile9, writeFile as writeFile9, mkdir as mkdir6 } from "node:fs/promises";
import path13 from "node:path";
var CACHE_VERSION = 1;
var DEFAULT_CACHE_TTL_MS = 5 * 60 * 1e3;
var EtagCache = class {
  state;
  cacheFile;
  dirty;
  constructor(cacheDir) {
    this.cacheFile = path13.join(cacheDir, "github-etag-cache.json");
    this.state = { version: CACHE_VERSION, entries: {} };
    this.dirty = false;
  }
  async load() {
    if (!existsSync10(this.cacheFile))
      return;
    try {
      const raw = await readFile9(this.cacheFile, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && "version" in parsed && parsed.version === CACHE_VERSION && "entries" in parsed && typeof parsed.entries === "object") {
        this.state = parsed;
      }
    } catch {
      this.state = { version: CACHE_VERSION, entries: {} };
    }
  }
  async save() {
    if (!this.dirty)
      return;
    const dir = path13.dirname(this.cacheFile);
    if (!existsSync10(dir)) {
      await mkdir6(dir, { recursive: true });
    }
    await writeFile9(this.cacheFile, `${JSON.stringify(this.state, null, 2)}
`, "utf8");
    this.dirty = false;
  }
  get(key) {
    return this.state.entries[key];
  }
  set(key, etag, data) {
    this.state.entries[key] = {
      etag,
      cachedAt: (/* @__PURE__ */ new Date()).toISOString(),
      data
    };
    this.dirty = true;
  }
  invalidate(key) {
    if (key in this.state.entries) {
      delete this.state.entries[key];
      this.dirty = true;
      return true;
    }
    return false;
  }
  invalidatePrefix(prefix) {
    let count = 0;
    for (const key of Object.keys(this.state.entries)) {
      if (key.startsWith(prefix)) {
        delete this.state.entries[key];
        count++;
      }
    }
    if (count > 0)
      this.dirty = true;
    return count;
  }
  clear() {
    this.state = { version: CACHE_VERSION, entries: {} };
    this.dirty = true;
  }
  isFresh(key, ttlMs = DEFAULT_CACHE_TTL_MS) {
    const entry = this.state.entries[key];
    if (!entry)
      return false;
    const age = Date.now() - new Date(entry.cachedAt).getTime();
    return age < ttlMs;
  }
};
var BULK_ISSUE_QUERY = `
query($owner: String!, $repo: String!, $states: [IssueState!], $since: DateTime) {
  repository(owner: $owner, name: $repo) {
    issues(first: 100, states: $states, filterBy: {since: $since}, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes {
        number
        title
        state
        updatedAt
        labels(first: 20) {
          nodes { name }
        }
        assignees(first: 10) {
          nodes { login }
        }
        comments(last: 10) {
          nodes {
            id
            author { login }
            body
            createdAt
          }
        }
        projectItems(first: 5) {
          nodes {
            fieldValues(first: 20) {
              nodes {
                ... on ProjectV2ItemFieldSingleSelectValue {
                  name
                  field {
                    ... on ProjectV2SingleSelectField { name }
                  }
                }
              }
            }
          }
        }
        timelineItems(first: 1, itemTypes: [CROSS_REFERENCED_EVENT]) {
          nodes {
            ... on CrossReferencedEvent {
              source {
                ... on PullRequest {
                  number
                  state
                  merged
                  mergeable
                  headRefOid
                  commits(last: 1) {
                    nodes {
                      commit {
                        checkSuites(first: 5) {
                          nodes {
                            checkRuns(first: 20) {
                              nodes {
                                name
                                status
                                conclusion
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}`.trim();
function parseRepoSlug(repo) {
  const [owner, name, ...rest] = repo.split("/");
  if (!owner || !name || rest.length > 0)
    return null;
  return { owner, name };
}
async function fetchBulkIssueState(repo, execGh, options = {}) {
  const slug = parseRepoSlug(repo);
  if (!slug) {
    return { issues: [], fetchedAt: (/* @__PURE__ */ new Date()).toISOString(), fromCache: false };
  }
  const { states = ["OPEN"], since } = options;
  const args = [
    "api",
    "graphql",
    "-f",
    `query=${BULK_ISSUE_QUERY}`,
    "-F",
    `owner=${slug.owner}`,
    "-F",
    `repo=${slug.name}`,
    "-F",
    `states=${states.join(",")}`
  ];
  if (since) {
    args.push("-F", `since=${since}`);
  }
  const result = await execGh(args);
  const parsed = JSON.parse(result.stdout);
  const nodes = parsed.data?.repository?.issues?.nodes ?? [];
  const issues = [];
  for (const node of nodes) {
    if (typeof node.number !== "number")
      continue;
    let pr = null;
    const timelineNodes = node.timelineItems?.nodes ?? [];
    for (const timelineNode of timelineNodes) {
      const source = timelineNode?.source;
      if (source && typeof source.number === "number") {
        const checkRuns = [];
        const commitNodes = source.commits?.nodes ?? [];
        for (const commitNode of commitNodes) {
          const suiteNodes = commitNode?.commit?.checkSuites?.nodes ?? [];
          for (const suite of suiteNodes) {
            const runNodes = suite?.checkRuns?.nodes ?? [];
            for (const run of runNodes) {
              if (typeof run?.name === "string") {
                checkRuns.push({
                  name: run.name,
                  status: typeof run.status === "string" ? run.status : "",
                  conclusion: typeof run.conclusion === "string" ? run.conclusion : null
                });
              }
            }
          }
        }
        pr = {
          number: source.number,
          state: typeof source.state === "string" ? source.state : "",
          merged: source.merged === true,
          mergeable: typeof source.mergeable === "string" ? source.mergeable : null,
          headSha: typeof source.headRefOid === "string" ? source.headRefOid : "",
          checkRuns
        };
        break;
      }
    }
    let projectStatus = null;
    const projectNodes = node.projectItems?.nodes ?? [];
    for (const projectNode of projectNodes) {
      const fieldNodes = projectNode?.fieldValues?.nodes ?? [];
      for (const fieldNode of fieldNodes) {
        if (fieldNode?.field?.name === "Status" && typeof fieldNode.name === "string") {
          projectStatus = fieldNode.name;
          break;
        }
      }
      if (projectStatus)
        break;
    }
    if (options.issueNumbers && !options.issueNumbers.includes(node.number)) {
      continue;
    }
    issues.push({
      number: node.number,
      title: typeof node.title === "string" ? node.title : "",
      state: typeof node.state === "string" ? node.state : "",
      updatedAt: typeof node.updatedAt === "string" ? node.updatedAt : "",
      labels: (node.labels?.nodes ?? []).map((l) => typeof l?.name === "string" ? l.name : "").filter(Boolean),
      assignees: (node.assignees?.nodes ?? []).map((a) => typeof a?.login === "string" ? a.login : "").filter(Boolean),
      pr,
      comments: (node.comments?.nodes ?? []).filter((c) => typeof c?.id === "string" && typeof c?.body === "string").map((c) => ({
        id: parseInt(c.id.replace(/\D/g, ""), 10) || 0,
        author: typeof c.author?.login === "string" ? c.author.login : "unknown",
        body: c.body,
        createdAt: typeof c.createdAt === "string" ? c.createdAt : ""
      })),
      projectStatus
    });
  }
  return {
    issues,
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    fromCache: false
  };
}
function detectIssueChanges(current, lastKnown) {
  if (!lastKnown.updatedAt) {
    return { changed: true, reason: "first_seen" };
  }
  if (current.updatedAt !== lastKnown.updatedAt) {
    return {
      changed: true,
      reason: "timestamp_mismatch",
      previousUpdatedAt: lastKnown.updatedAt,
      currentUpdatedAt: current.updatedAt
    };
  }
  if (current.pr && !lastKnown.prNumber) {
    return { changed: true, reason: "pr_created" };
  }
  if (current.pr && lastKnown.prNumber && current.pr.number !== lastKnown.prNumber) {
    return { changed: true, reason: "pr_changed" };
  }
  if (current.pr && current.pr.state === "MERGED" && lastKnown.state !== "merged") {
    return { changed: true, reason: "pr_merged" };
  }
  return { changed: false, reason: "unchanged" };
}

// src/commands/orchestrate.ts
var HOUSEKEEPING_AGENTS = /* @__PURE__ */ new Set(["spec-consistency", "spec-backfill", "guard", "loop-health-supervisor"]);
var defaultDeps4 = {
  existsSync: existsSync11,
  readFile: readFile10,
  writeFile: writeFile10,
  mkdir: mkdir7,
  unlink: unlink2,
  readdirSync,
  now: () => /* @__PURE__ */ new Date()
};
function normalizeTaskSandbox(sandbox) {
  return sandbox === "none" ? "none" : "container";
}
function normalizeTaskRequires(requires) {
  if (!Array.isArray(requires))
    return [];
  return requires.map((label) => label.trim().toLowerCase()).filter((label, index, all) => label.length > 0 && all.indexOf(label) === index);
}
function parseConcurrency(value) {
  if (!value)
    return 3;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`Invalid concurrency value: ${value} (must be a positive integer)`);
  }
  return parsed;
}
function parseIssueNumbers(value) {
  if (!value)
    return null;
  const numbers = value.split(",").map((s) => {
    const n = Number.parseInt(s.trim(), 10);
    if (!Number.isFinite(n) || n < 1) {
      throw new Error(`Invalid issue number: ${s.trim()}`);
    }
    return n;
  });
  return numbers;
}
function parseBudget(value) {
  if (!value)
    return null;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid budget value: ${value} (must be a positive number in USD)`);
  }
  return parsed;
}
var projectStatusContextCache = /* @__PURE__ */ new Map();
var PROJECT_STATUS_FIELD_NAME = "Status";
function parseRepoSlug2(repo) {
  const [owner, name, ...rest] = repo.split("/");
  if (!owner || !name || rest.length > 0)
    return null;
  return { owner, name };
}
async function resolveIssueProjectStatusContext(repo, issueNumber, deps) {
  const cacheKey = `${repo}#${issueNumber}`;
  if (projectStatusContextCache.has(cacheKey)) {
    return projectStatusContextCache.get(cacheKey) ?? null;
  }
  const slug = parseRepoSlug2(repo);
  if (!slug) {
    projectStatusContextCache.set(cacheKey, null);
    return null;
  }
  const query = "query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){issue(number:$number){projectItems(first:20){nodes{id project{id} fieldValues(first:50){nodes{... on ProjectV2ItemFieldSingleSelectValue{field{... on ProjectV2SingleSelectField{id name options{id name}}}}}}}}}}}";
  const response = await deps.execGh([
    "api",
    "graphql",
    "-f",
    `query=${query}`,
    "-F",
    `owner=${slug.owner}`,
    "-F",
    `repo=${slug.name}`,
    "-F",
    `number=${issueNumber}`
  ]);
  const parsed = JSON.parse(response.stdout);
  const nodes = parsed.data?.repository?.issue?.projectItems?.nodes;
  if (!Array.isArray(nodes)) {
    projectStatusContextCache.set(cacheKey, null);
    return null;
  }
  for (const node of nodes) {
    const itemId = typeof node.id === "string" ? node.id : "";
    const projectId = typeof node.project?.id === "string" ? node.project.id : "";
    if (!itemId || !projectId)
      continue;
    const fieldNodes = node.fieldValues?.nodes;
    if (!Array.isArray(fieldNodes))
      continue;
    for (const fieldNode of fieldNodes) {
      const field = fieldNode.field;
      if (!field || field.name !== PROJECT_STATUS_FIELD_NAME)
        continue;
      const fieldId = typeof field.id === "string" ? field.id : "";
      if (!fieldId || !Array.isArray(field.options) || field.options.length === 0)
        continue;
      const statusOptions = /* @__PURE__ */ new Map();
      for (const option of field.options) {
        if (typeof option.name === "string" && typeof option.id === "string") {
          statusOptions.set(option.name.toLowerCase(), option.id);
        }
      }
      const context = {
        itemId,
        projectId,
        statusFieldId: fieldId,
        statusOptions
      };
      projectStatusContextCache.set(cacheKey, context);
      return context;
    }
  }
  projectStatusContextCache.set(cacheKey, null);
  return null;
}
async function syncIssueProjectStatus(issueNumber, repo, targetStatus, deps) {
  try {
    const context = await resolveIssueProjectStatusContext(repo, issueNumber, deps);
    if (!context) {
      deps.appendLog?.(deps.sessionDir ?? "", {
        timestamp: deps.now?.().toISOString() ?? (/* @__PURE__ */ new Date()).toISOString(),
        event: "project_status_sync_skipped",
        issue_number: issueNumber,
        target_status: targetStatus,
        reason: "status_field_not_found"
      });
      return false;
    }
    const optionId = context.statusOptions.get(targetStatus.toLowerCase());
    if (!optionId) {
      deps.appendLog?.(deps.sessionDir ?? "", {
        timestamp: deps.now?.().toISOString() ?? (/* @__PURE__ */ new Date()).toISOString(),
        event: "project_status_sync_skipped",
        issue_number: issueNumber,
        target_status: targetStatus,
        reason: "status_option_not_found"
      });
      return false;
    }
    await deps.execGh([
      "project",
      "item-edit",
      "--id",
      context.itemId,
      "--project-id",
      context.projectId,
      "--field-id",
      context.statusFieldId,
      "--single-select-option-id",
      optionId
    ]);
    deps.appendLog?.(deps.sessionDir ?? "", {
      timestamp: deps.now?.().toISOString() ?? (/* @__PURE__ */ new Date()).toISOString(),
      event: "project_status_synced",
      issue_number: issueNumber,
      target_status: targetStatus
    });
    return true;
  } catch (error) {
    deps.appendLog?.(deps.sessionDir ?? "", {
      timestamp: deps.now?.().toISOString() ?? (/* @__PURE__ */ new Date()).toISOString(),
      event: "project_status_sync_failed",
      issue_number: issueNumber,
      target_status: targetStatus,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}
function assertAutonomyLevel(value) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === "balanced")
    return "balanced";
  if (normalized === "cautious" || normalized === "autonomous")
    return normalized;
  throw new Error(`Invalid autonomy level: ${value} (must be cautious, balanced, or autonomous)`);
}
function parseConfigScalar(content, key) {
  const matcher = new RegExp(`^\\s*${key}:\\s*(.+?)\\s*$`, "m");
  const match = content.match(matcher);
  if (!match)
    return null;
  const raw = match[1].split(/\s+#/, 1)[0].trim();
  if (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2) {
    return raw.slice(1, -1).replace(/''/g, "'");
  }
  if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
    return raw.slice(1, -1).replace(/\\"/g, '"');
  }
  return raw;
}
async function resolveOrchestratorAutonomyLevel(options, homeDir, deps) {
  if (options.autonomyLevel) {
    return assertAutonomyLevel(options.autonomyLevel);
  }
  const projectRoot = resolveProjectRoot2(options.projectRoot);
  const projectHash = getProjectHash2(projectRoot);
  const configPath = path14.join(homeDir, ".aloop", "projects", projectHash, "config.yml");
  if (!deps.existsSync(configPath)) {
    return "balanced";
  }
  try {
    const configContent = await deps.readFile(configPath, "utf8");
    return assertAutonomyLevel(parseConfigScalar(configContent, "autonomy_level") ?? void 0);
  } catch {
    return "balanced";
  }
}
async function resolveAutoMerge(options, homeDir, deps) {
  if (options.autoMerge !== void 0) {
    return options.autoMerge;
  }
  const projectRoot = resolveProjectRoot2(options.projectRoot);
  const projectHash = getProjectHash2(projectRoot);
  const configPath = path14.join(homeDir, ".aloop", "projects", projectHash, "config.yml");
  if (!deps.existsSync(configPath)) {
    return false;
  }
  try {
    const configContent = await deps.readFile(configPath, "utf8");
    const value = parseConfigScalar(configContent, "auto_merge_to_main");
    return value === "true";
  } catch {
    return false;
  }
}
function validateDependencyGraph(issues) {
  const ids = new Set(issues.map((i) => i.id));
  if (ids.size !== issues.length) {
    const seen = /* @__PURE__ */ new Set();
    for (const issue of issues) {
      if (seen.has(issue.id)) {
        throw new Error(`Duplicate issue id: ${issue.id}`);
      }
      seen.add(issue.id);
    }
  }
  for (const issue of issues) {
    for (const dep of issue.depends_on) {
      if (!ids.has(dep)) {
        throw new Error(`Issue ${issue.id} depends on unknown issue ${dep}`);
      }
    }
    if (issue.depends_on.includes(issue.id)) {
      throw new Error(`Issue ${issue.id} depends on itself`);
    }
  }
  const inDegree = /* @__PURE__ */ new Map();
  const adj = /* @__PURE__ */ new Map();
  for (const issue of issues) {
    inDegree.set(issue.id, 0);
    adj.set(issue.id, []);
  }
  for (const issue of issues) {
    for (const dep of issue.depends_on) {
      adj.get(dep).push(issue.id);
      inDegree.set(issue.id, (inDegree.get(issue.id) ?? 0) + 1);
    }
  }
  const queue = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0)
      queue.push(id);
  }
  let processed = 0;
  while (queue.length > 0) {
    const current = queue.shift();
    processed++;
    for (const neighbor of adj.get(current)) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0)
        queue.push(neighbor);
    }
  }
  if (processed !== issues.length) {
    throw new Error("Dependency graph contains a cycle");
  }
}
function assignWaves(issues) {
  const waveMap = /* @__PURE__ */ new Map();
  const depMap = /* @__PURE__ */ new Map();
  for (const issue of issues) {
    depMap.set(issue.id, issue.depends_on);
  }
  const computeWave = (id, visited) => {
    if (waveMap.has(id))
      return waveMap.get(id);
    if (visited.has(id))
      throw new Error("Unexpected cycle during wave assignment");
    visited.add(id);
    const deps = depMap.get(id) ?? [];
    if (deps.length === 0) {
      waveMap.set(id, 1);
      return 1;
    }
    let maxDepWave = 0;
    for (const dep of deps) {
      maxDepWave = Math.max(maxDepWave, computeWave(dep, visited));
    }
    const wave = maxDepWave + 1;
    waveMap.set(id, wave);
    return wave;
  };
  for (const issue of issues) {
    if (!waveMap.has(issue.id)) {
      computeWave(issue.id, /* @__PURE__ */ new Set());
    }
  }
  return waveMap;
}
async function applyDecompositionPlan(plan, state, sessionDir, repo, deps) {
  validateDependencyGraph(plan.issues);
  const waveMap = assignWaves(plan.issues);
  const maxWave = Math.max(0, ...Array.from(waveMap.values()));
  const idToGhNumber = /* @__PURE__ */ new Map();
  const updatedIssues = [];
  for (const planIssue of plan.issues) {
    const wave = waveMap.get(planIssue.id);
    const labels = ["aloop", `aloop/wave-${wave}`];
    let ghNumber;
    if (deps.execGhIssueCreate && repo) {
      ghNumber = await deps.execGhIssueCreate(repo, path14.basename(sessionDir), planIssue.title, planIssue.body, labels);
    } else {
      ghNumber = planIssue.id;
    }
    idToGhNumber.set(planIssue.id, ghNumber);
    updatedIssues.push({
      number: ghNumber,
      title: planIssue.title,
      body: planIssue.body,
      file_hints: planIssue.file_hints ?? [],
      sandbox: normalizeTaskSandbox(planIssue.sandbox),
      requires: normalizeTaskRequires(planIssue.requires),
      wave,
      state: "pending",
      status: "Needs refinement",
      child_session: null,
      pr_number: null,
      depends_on: planIssue.depends_on.map((depId) => idToGhNumber.get(depId) ?? depId),
      blocked_on_human: false,
      processed_comment_ids: [],
      triage_log: [],
      dor_validated: false
    });
  }
  const updatedState = {
    ...state,
    issues: updatedIssues,
    current_wave: maxWave > 0 ? 1 : 0,
    updated_at: deps.now().toISOString()
  };
  return updatedState;
}
var ORCH_SCAN_PROMPT_FILENAME = "PROMPT_orch_scan.md";
var ORCH_ESTIMATE_PROMPT_FILENAME = "PROMPT_orch_estimate.md";
var ORCH_DECOMPOSE_PROMPT_FILENAME = "PROMPT_orch_decompose.md";
var ORCH_SUB_DECOMPOSE_PROMPT_FILENAME = "PROMPT_orch_sub_decompose.md";
var ORCH_PRODUCT_ANALYST_PROMPT_FILENAME = "PROMPT_orch_product_analyst.md";
var ORCH_ARCH_ANALYST_PROMPT_FILENAME = "PROMPT_orch_arch_analyst.md";
var ORCH_REPLAN_PROMPT_FILENAME = "PROMPT_orch_replan.md";
var ORCH_SPEC_CONSISTENCY_PROMPT_FILENAME = "PROMPT_orch_spec_consistency.md";
var ORCH_REVIEW_PROMPT_FILENAME = "PROMPT_orch_review.md";
var DEFAULT_SPEC_GLOB = "SPEC.md specs/*.md";
function resolveSpecFiles(specInput, projectRoot, deps) {
  const patterns = specInput.split(/[\s,]+/).filter((p) => p.length > 0);
  const resolved = [];
  const seen = /* @__PURE__ */ new Set();
  const readdirFn = deps.readdirSync ?? readdirSync;
  for (const pattern of patterns) {
    if (pattern.includes("*")) {
      const dir = path14.resolve(projectRoot, path14.dirname(pattern));
      const ext = path14.extname(pattern.replace("*", "x"));
      if (!deps.existsSync(dir))
        continue;
      let entries;
      try {
        entries = readdirFn(dir);
      } catch {
        continue;
      }
      const matching = entries.filter((e) => ext ? e.endsWith(ext) : true).sort().map((e) => path14.join(dir, e));
      for (const p of matching) {
        if (!seen.has(p)) {
          seen.add(p);
          resolved.push(p);
        }
      }
    } else {
      const p = path14.resolve(projectRoot, pattern);
      if (!seen.has(p)) {
        seen.add(p);
        resolved.push(p);
      }
    }
  }
  return resolved;
}
async function loadMergedSpecContent(specFiles, deps) {
  const existing = specFiles.filter((f) => deps.existsSync(f));
  if (existing.length === 0)
    return "";
  if (existing.length === 1) {
    return deps.readFile(existing[0], "utf8");
  }
  const sections = [];
  for (const file of existing) {
    const content = await deps.readFile(file, "utf8");
    const basename3 = path14.basename(file);
    sections.push(`<!-- spec: ${basename3} -->

${content}`);
  }
  return sections.join("\n\n---\n\n");
}
var ORCH_ESTIMATE_PROMPT_FALLBACK = `# Orchestrator Estimation Agent

You are Aloop, the estimation agent for orchestrator readiness checks.

## Objective

Estimate implementation effort and risk for one refined sub-issue.

## Required Outputs

- Complexity tier: \`S\`, \`M\`, \`L\`, or \`XL\`
- Estimated child-loop iteration count
- Key risk flags (novel tech, unclear requirements, high coupling, external dependency)
- Confidence note (high/medium/low) with rationale

## Readiness Check

Confirm whether the item satisfies Definition of Ready:

- Acceptance criteria are specific and testable
- No unresolved linked \`aloop/spec-question\` blockers
- Dependencies are resolved/scheduled
- Planner approach is present
- Interface contracts are explicit

If DoR passes, recommend Project status \`Ready\` while keeping tracking label \`aloop\`; otherwise keep blocked and list gaps.
`;
var ORCH_PRODUCT_ANALYST_FALLBACK = `# Orchestrator Product Analyst

You are Aloop, the product analyst agent for orchestrator refinement.

## Objective

Find product-level gaps that would cause rework during implementation.

## Review Focus

- Missing user stories/personas
- Ambiguous acceptance criteria
- Scope holes and undefined referenced features
- Conflicting product requirements between sections/issues
- Edge cases and error flows that are not specified

## Output

For each actionable gap:

1. Create one focused \`aloop/spec-question\` issue payload (interview style).
2. Include: the question, why this gap matters, concrete resolution options, which epic/sub-issue is blocked.
3. Write requests to \`requests/*.json\` using runtime-supported request formats.

If no material gap exists, write no-op updates only (no filler questions).
`;
var ORCH_ARCH_ANALYST_FALLBACK = `# Orchestrator Architecture Analyst

You are Aloop, the architecture analyst agent for orchestrator refinement.

## Objective

Find architecture and technical gaps before decomposition or dispatch.

## Review Focus

- Infeasible constraints
- Missing system boundaries and integration points
- Unstated technical dependencies (data stores, services, auth, queues)
- Undefined API/data contracts
- Performance/scale assumptions lacking measurable targets
- Migration/backward-compatibility risks

## Output

- Raise focused \`aloop/spec-question\` issues for unresolved architecture gaps.
- Update affected issue body text with clarified constraints/contracts when possible.
- Write only concrete runtime requests to \`requests/*.json\`.
- Do not emit broad or speculative redesign work.
`;
var ORCH_DECOMPOSE_FALLBACK = `# Orchestrator Decompose (Epic Creation)

You are Aloop, the epic decomposition agent.

Convert the spec into top-level vertical slices (epics) with acceptance criteria and dependency hints.
Write concrete \`requests/*.json\` files for issue creation, and prefer coherent end-to-end slices.
`;
var ORCH_SUB_DECOMPOSE_FALLBACK = `# Orchestrator Sub-Issue Decompose

You are Aloop, the sub-issue decomposition agent.

Break one refined epic into scoped work units suitable for child loops.
Each sub-issue must be independently actionable with clear file ownership hints.
`;
var ORCH_REVIEW_FALLBACK = `# Orchestrator Review Layer

You are Aloop, the orchestrator review agent.

## Objective

Review a child loop's PR to ensure it meets the requirements of the issue and the overall specification.

## Process

1. Read the issue description and the global specification.
2. Review the PR diff for correctness, style, and completeness.
3. Verify that proof of work (if any) is valid and matches the changes.
4. Provide a verdict: \`approve\`, \`request-changes\`, or \`flag-for-human\`.

## Rules

- Reject code that deviates from the specification or architectural standards.
- Flag ambiguous or high-risk changes for human review.
- Provide clear, actionable feedback when requesting changes.
`;
function buildOrchestratorScanPrompt() {
  return `---
agent: orch_scan
reasoning: medium
---

# Orchestrator Scan (Heartbeat)

You are the orchestrator scan agent.

Run one lightweight monitoring pass:
- Read current orchestrator state and identify items ready for progress.
- Prioritize queued override prompts from \`queue/\` when present.
- Write any required side effects into \`requests/*.json\`.
- Keep this step reactive and minimal; avoid large speculative planning.
`;
}
async function orchestrateCommandWithDeps(options = {}, deps = defaultDeps4) {
  const homeDir = resolveHomeDir2(options.homeDir);
  const aloopRoot = path14.join(homeDir, ".aloop");
  const sessionsRoot = path14.join(aloopRoot, "sessions");
  const specInput = options.spec ?? "SPEC.md";
  const projectRoot = options.projectRoot ? path14.resolve(options.projectRoot) : process.cwd();
  const specFiles = resolveSpecFiles(specInput, projectRoot, deps);
  const existingSpecFiles = specFiles.filter((f) => deps.existsSync(f));
  if (existingSpecFiles.length === 0) {
    throw new Error(`No spec files found matching: ${specInput}`);
  }
  const specFile = path14.relative(projectRoot, existingSpecFiles[0]) || existingSpecFiles[0];
  const trunkBranch = options.trunk ?? "agent/trunk";
  const concurrencyCap = parseConcurrency(options.concurrency);
  const filterIssues = parseIssueNumbers(options.issues);
  const filterLabel = options.label ?? null;
  const filterRepo = options.repo ?? null;
  const planOnly = options.planOnly ?? false;
  const budgetCap = parseBudget(options.budget);
  const autonomyLevel = await resolveOrchestratorAutonomyLevel(options, homeDir, deps);
  const autoMergeToMain = await resolveAutoMerge(options, homeDir, deps);
  const now = deps.now();
  const timestamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}-${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}${String(now.getUTCSeconds()).padStart(2, "0")}`;
  const sessionId = `orchestrator-${timestamp}`;
  const sessionDir = path14.join(sessionsRoot, sessionId);
  const promptsDir = path14.join(sessionDir, "prompts");
  const queueDir = path14.join(sessionDir, "queue");
  const requestsDir = path14.join(sessionDir, "requests");
  const loopPlanFile = path14.join(sessionDir, "loop-plan.json");
  const orchScanPromptFile = path14.join(promptsDir, ORCH_SCAN_PROMPT_FILENAME);
  const orchEstimatePromptFile = path14.join(promptsDir, ORCH_ESTIMATE_PROMPT_FILENAME);
  await deps.mkdir(sessionDir, { recursive: true });
  await deps.mkdir(promptsDir, { recursive: true });
  await deps.mkdir(queueDir, { recursive: true });
  await deps.mkdir(requestsDir, { recursive: true });
  const loopPlan = {
    cycle: [ORCH_SCAN_PROMPT_FILENAME],
    cyclePosition: 0,
    iteration: 1,
    version: 1
  };
  await deps.writeFile(loopPlanFile, `${JSON.stringify(loopPlan, null, 2)}
`, "utf8");
  await deps.writeFile(orchScanPromptFile, buildOrchestratorScanPrompt(), "utf8");
  const estimateTemplatePath = path14.join(projectRoot, "aloop", "templates", ORCH_ESTIMATE_PROMPT_FILENAME);
  const estimatePrompt = deps.existsSync(estimateTemplatePath) ? await deps.readFile(estimateTemplatePath, "utf8") : ORCH_ESTIMATE_PROMPT_FALLBACK;
  await deps.writeFile(orchEstimatePromptFile, estimatePrompt, "utf8");
  const productAnalystTemplatePath = path14.join(projectRoot, "aloop", "templates", ORCH_PRODUCT_ANALYST_PROMPT_FILENAME);
  const productAnalystPrompt = deps.existsSync(productAnalystTemplatePath) ? await deps.readFile(productAnalystTemplatePath, "utf8") : ORCH_PRODUCT_ANALYST_FALLBACK;
  await deps.writeFile(path14.join(promptsDir, ORCH_PRODUCT_ANALYST_PROMPT_FILENAME), productAnalystPrompt, "utf8");
  const archAnalystTemplatePath = path14.join(projectRoot, "aloop", "templates", ORCH_ARCH_ANALYST_PROMPT_FILENAME);
  const archAnalystPrompt = deps.existsSync(archAnalystTemplatePath) ? await deps.readFile(archAnalystTemplatePath, "utf8") : ORCH_ARCH_ANALYST_FALLBACK;
  await deps.writeFile(path14.join(promptsDir, ORCH_ARCH_ANALYST_PROMPT_FILENAME), archAnalystPrompt, "utf8");
  const decomposeTemplatePath = path14.join(projectRoot, "aloop", "templates", ORCH_DECOMPOSE_PROMPT_FILENAME);
  const decomposePrompt = deps.existsSync(decomposeTemplatePath) ? await deps.readFile(decomposeTemplatePath, "utf8") : ORCH_DECOMPOSE_FALLBACK;
  await deps.writeFile(path14.join(promptsDir, ORCH_DECOMPOSE_PROMPT_FILENAME), decomposePrompt, "utf8");
  const subDecomposeTemplatePath = path14.join(projectRoot, "aloop", "templates", ORCH_SUB_DECOMPOSE_PROMPT_FILENAME);
  const subDecomposePrompt = deps.existsSync(subDecomposeTemplatePath) ? await deps.readFile(subDecomposeTemplatePath, "utf8") : ORCH_SUB_DECOMPOSE_FALLBACK;
  await deps.writeFile(path14.join(promptsDir, ORCH_SUB_DECOMPOSE_PROMPT_FILENAME), subDecomposePrompt, "utf8");
  const reviewTemplatePath = path14.join(projectRoot, "aloop", "templates", ORCH_REVIEW_PROMPT_FILENAME);
  const reviewPrompt = deps.existsSync(reviewTemplatePath) ? await deps.readFile(reviewTemplatePath, "utf8") : ORCH_REVIEW_FALLBACK;
  await deps.writeFile(path14.join(promptsDir, ORCH_REVIEW_PROMPT_FILENAME), reviewPrompt, "utf8");
  const replanTemplatePath = path14.join(projectRoot, "aloop", "templates", ORCH_REPLAN_PROMPT_FILENAME);
  if (deps.existsSync(replanTemplatePath)) {
    const replanPrompt = await deps.readFile(replanTemplatePath, "utf8");
    await deps.writeFile(path14.join(promptsDir, ORCH_REPLAN_PROMPT_FILENAME), replanPrompt, "utf8");
  }
  const consistencyTemplatePath = path14.join(projectRoot, "aloop", "templates", ORCH_SPEC_CONSISTENCY_PROMPT_FILENAME);
  if (deps.existsSync(consistencyTemplatePath)) {
    const consistencyPrompt = await deps.readFile(consistencyTemplatePath, "utf8");
    await deps.writeFile(path14.join(promptsDir, ORCH_SPEC_CONSISTENCY_PROMPT_FILENAME), consistencyPrompt, "utf8");
  }
  const specGlob = specInput.includes("*") ? specInput : DEFAULT_SPEC_GLOB;
  let state = {
    spec_file: specFile,
    spec_files: existingSpecFiles.map((f) => path14.relative(projectRoot, f) || f),
    spec_glob: specGlob,
    autonomy_level: autonomyLevel,
    trunk_branch: trunkBranch,
    concurrency_cap: concurrencyCap,
    current_wave: 0,
    plan_only: planOnly,
    issues: [],
    completed_waves: [],
    filter_issues: filterIssues,
    filter_label: filterLabel,
    filter_repo: filterRepo,
    budget_cap: budgetCap,
    auto_merge_to_main: autoMergeToMain || void 0,
    created_at: now.toISOString(),
    updated_at: now.toISOString()
  };
  if (options.plan) {
    const planPath = path14.resolve(options.plan);
    if (!deps.existsSync(planPath)) {
      throw new Error(`Plan file not found: ${planPath}`);
    }
    const planContent = await deps.readFile(planPath, "utf8");
    let plan;
    try {
      plan = JSON.parse(planContent);
    } catch {
      throw new Error(`Invalid JSON in plan file: ${planPath}`);
    }
    if (!Array.isArray(plan.issues) || plan.issues.length === 0) {
      throw new Error('Plan file must contain a non-empty "issues" array');
    }
    state = await applyDecompositionPlan(plan, state, sessionDir, filterRepo, deps);
  }
  const epicDecompositionResultsFile = path14.join(requestsDir, "epic-decomposition-results.json");
  if (deps.existsSync(epicDecompositionResultsFile)) {
    const epicResultsContent = await deps.readFile(epicDecompositionResultsFile, "utf8");
    try {
      const epicPlan = JSON.parse(epicResultsContent);
      if (Array.isArray(epicPlan.issues) && epicPlan.issues.length > 0) {
        state = await applyDecompositionPlan(epicPlan, state, sessionDir, filterRepo, deps);
      }
    } catch {
    }
  }
  if (!options.plan && state.issues.length === 0) {
    const specLabel = existingSpecFiles.length > 1 ? existingSpecFiles.map((f) => path14.relative(projectRoot, f) || f).join(", ") : specFile;
    await createEpicDecompositionRequest(specLabel, requestsDir, { writeFile: deps.writeFile, now: deps.now });
    const specContent = await loadMergedSpecContent(existingSpecFiles, deps);
    await queueEpicDecomposition(specLabel, specContent, queueDir, decomposePrompt, { writeFile: deps.writeFile });
  }
  const subDecompositionResultsFile = path14.join(requestsDir, "sub-decomposition-results.json");
  if (deps.existsSync(subDecompositionResultsFile)) {
    const subResultsContent = await deps.readFile(subDecompositionResultsFile, "utf8");
    try {
      const subResults = JSON.parse(subResultsContent);
      applySubDecompositionResults(state, subResults, deps.now());
    } catch {
    }
  }
  const decompositionTargets = state.issues.filter((issue) => issue.status === "Needs decomposition");
  if (decompositionTargets.length > 0) {
    await createSubDecompositionRequests(state.issues, requestsDir, { writeFile: deps.writeFile, now: deps.now });
    await queueSubDecompositionForIssues(
      state.issues,
      queueDir,
      subDecomposePrompt,
      { writeFile: deps.writeFile }
    );
  }
  const gapAnalysisTargets = state.issues.filter((issue) => issue.status === "Needs analysis");
  if (gapAnalysisTargets.length > 0) {
    await createGapAnalysisRequests(state.issues, requestsDir, deps);
    const specContent = await loadMergedSpecContent(existingSpecFiles, deps);
    await queueGapAnalysisForIssues(
      state.issues,
      queueDir,
      productAnalystPrompt,
      archAnalystPrompt,
      specContent,
      deps
    );
  }
  if (filterRepo && state.issues.length > 0 && deps.execGh) {
    await runTriageMonitorCycle(state, path14.basename(sessionDir), filterRepo, deps, aloopRoot);
  }
  const dorTargets = state.issues.filter((issue) => issue.status === "Needs refinement" && issue.dor_validated !== true).map((issue) => ({
    issue_number: issue.number,
    title: issue.title,
    wave: issue.wave,
    depends_on: issue.depends_on
  }));
  if (dorTargets.length > 0) {
    const estimateRequestFile = path14.join(requestsDir, "estimate-readiness.json");
    const estimateRequest = {
      type: "definition_of_ready_estimate",
      prompt_template: ORCH_ESTIMATE_PROMPT_FILENAME,
      generated_at: deps.now().toISOString(),
      targets: dorTargets
    };
    await deps.writeFile(estimateRequestFile, `${JSON.stringify(estimateRequest, null, 2)}
`, "utf8");
    await queueEstimateForIssues(
      state.issues,
      queueDir,
      estimatePrompt,
      deps
    );
  }
  const estimateResponseFile = path14.join(requestsDir, "estimate-results.json");
  if (deps.existsSync(estimateResponseFile)) {
    const responseContent = await deps.readFile(estimateResponseFile, "utf8");
    try {
      const estimateResults = JSON.parse(responseContent);
      await applyEstimateResults(state, estimateResults, {
        execGhIssueCreate: deps.execGhIssueCreate,
        execGh: deps.execGh,
        now: deps.now,
        repo: filterRepo ?? void 0,
        sessionId,
        sessionDir
      });
    } catch {
    }
  }
  const stateFile = path14.join(sessionDir, "orchestrator.json");
  await deps.writeFile(stateFile, `${JSON.stringify(state, null, 2)}
`, "utf8");
  let scanLoopResult;
  if (options.runScanLoop && !planOnly && state.issues.length > 0) {
    const intervalMs = parseInterval(options.interval);
    const maxIter = parseMaxIterations(options.maxIterations);
    const logFile = path14.join(sessionDir, "log.jsonl");
    const appendLog2 = async (_dir, entry) => {
      let existing = "";
      try {
        if (deps.existsSync(logFile)) {
          existing = await deps.readFile(logFile, "utf8");
        }
      } catch {
      }
      await deps.writeFile(logFile, `${existing}${JSON.stringify(entry)}
`, "utf8");
    };
    const aloopCacheDir = path14.join(aloopRoot, ".cache");
    const etagCache = new EtagCache(aloopCacheDir);
    await etagCache.load();
    const scanDeps = {
      existsSync: deps.existsSync,
      readFile: deps.readFile,
      writeFile: deps.writeFile,
      readdir: async (p) => readdir5(p),
      unlink: deps.unlink,
      now: deps.now,
      execGh: deps.execGh,
      appendLog: appendLog2,
      etagCache,
      prLifecycleDeps: deps.execGh ? {
        execGh: deps.execGh,
        readFile: deps.readFile,
        writeFile: deps.writeFile,
        now: deps.now,
        appendLog: (dir, entry) => {
          appendLog2(dir, entry);
        },
        invokeAgentReview: async (prNumber, repo, diff) => {
          const resultFile = path14.join(requestsDir, `review-result-${prNumber}.json`);
          if (deps.existsSync(resultFile)) {
            try {
              const content = await deps.readFile(resultFile, "utf8");
              const result = JSON.parse(content);
              if (deps.unlink)
                await deps.unlink(resultFile);
              return result;
            } catch (e) {
              return {
                pr_number: prNumber,
                verdict: "flag-for-human",
                summary: `Failed to parse review result: ${e instanceof Error ? e.message : String(e)}`
              };
            }
          }
          const queueFile = path14.join(queueDir, `review-${prNumber}.md`);
          if (!deps.existsSync(queueFile)) {
            const reviewPrompt2 = await deps.readFile(path14.join(promptsDir, ORCH_REVIEW_PROMPT_FILENAME), "utf8");
            const fullPrompt = `---
agent: orch_review
pr_number: ${prNumber}
---

${reviewPrompt2}

## PR Diff

\`\`\`diff
${diff}
\`\`\`
`;
            await deps.writeFile(queueFile, fullPrompt, "utf8");
            const requestFile = path14.join(requestsDir, `review-request-${prNumber}.json`);
            await deps.writeFile(requestFile, JSON.stringify({
              type: "agent_review",
              pr_number: prNumber,
              repo,
              queued_at: deps.now().toISOString()
            }, null, 2), "utf8");
          }
          return {
            pr_number: prNumber,
            verdict: "pending",
            summary: "Review queued and waiting for agent execution."
          };
        }
      } : void 0,
      sleep: (ms) => new Promise((resolve2) => setTimeout(resolve2, ms))
    };
    const promptsSourceDir = promptsDir;
    scanLoopResult = await runOrchestratorScanLoop(
      stateFile,
      sessionDir,
      projectRoot,
      path14.basename(sessionDir),
      promptsSourceDir,
      aloopRoot,
      filterRepo,
      intervalMs,
      maxIter,
      scanDeps
    );
    state = scanLoopResult.finalState;
  }
  return {
    session_dir: sessionDir,
    prompts_dir: promptsDir,
    queue_dir: queueDir,
    requests_dir: requestsDir,
    loop_plan_file: loopPlanFile,
    state_file: stateFile,
    state,
    scan_loop: scanLoopResult
  };
}
async function orchestrateCommand(options = {}, depsOrCommand) {
  const outputMode = options.output ?? "text";
  const deps = depsOrCommand && typeof depsOrCommand === "object" && "existsSync" in depsOrCommand ? depsOrCommand : void 0;
  const result = await orchestrateCommandWithDeps(options, deps);
  if (outputMode === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log("Orchestrator session initialized.");
  console.log("");
  console.log(`  Session dir:  ${result.session_dir}`);
  console.log(`  Prompts dir:  ${result.prompts_dir}`);
  console.log(`  Queue dir:    ${result.queue_dir}`);
  console.log(`  Requests dir: ${result.requests_dir}`);
  console.log(`  Loop plan:    ${result.loop_plan_file}`);
  console.log(`  State file:   ${result.state_file}`);
  console.log(`  Spec:         ${result.state.spec_files && result.state.spec_files.length > 1 ? result.state.spec_files.join(", ") : result.state.spec_file}`);
  console.log(`  Trunk:        ${result.state.trunk_branch}`);
  console.log(`  Autonomy:     ${result.state.autonomy_level ?? "balanced"}`);
  console.log(`  Concurrency:  ${result.state.concurrency_cap}`);
  console.log(`  Plan only:    ${result.state.plan_only}`);
  if (result.state.issues.length > 0) {
    const waves = new Set(result.state.issues.map((i) => i.wave));
    console.log(`  Issues:       ${result.state.issues.length} (${waves.size} wave${waves.size !== 1 ? "s" : ""})`);
  }
  if (result.state.filter_issues) {
    console.log(`  Filter:       ${result.state.filter_issues.join(", ")}`);
  }
  if (result.state.filter_label) {
    console.log(`  Label:        ${result.state.filter_label}`);
  }
  if (result.state.filter_repo) {
    console.log(`  Repo:         ${result.state.filter_repo}`);
  }
  if (result.state.budget_cap !== null) {
    console.log(`  Budget cap:   $${result.state.budget_cap.toFixed(2)}`);
  }
}
function applyTriageConfidenceFloor(result, floor = 0.7) {
  if (result.confidence >= floor) {
    return result;
  }
  return {
    ...result,
    classification: "needs_clarification",
    reasoning: `${result.reasoning} Confidence ${result.confidence.toFixed(2)} is below ${floor.toFixed(2)}; forcing needs_clarification.`
  };
}
function classifyTriageComment(comment) {
  const rawBody = comment.body.trim();
  const normalized = rawBody.toLowerCase();
  const lowSignalPatterns = [
    /^(thanks|thank you|lgtm|sgtm|nice work|great work|looks good|ok|okay|ack)[!. ]*$/i,
    /^(\+1|👍|✅)[!. ]*$/i
  ];
  const ambiguityPatterns = [
    /\b(maybe|perhaps|not sure|unclear|i wonder|hmm|might|possibly)\b/i,
    /\bshould we\b/i
  ];
  const questionPatterns = [
    /\?$/,
    /^\s*(can|could|would|should|is|are|why|what|how|when|where)\b/i
  ];
  const actionablePatterns = [
    /\b(please|must|need to|required|fix|implement|add|remove|rename|switch|change|update|refactor)\b/i,
    /\b(do|use)\s+[a-z0-9]/i
  ];
  let result;
  if (normalized.length === 0) {
    result = {
      comment_id: comment.id,
      classification: "out_of_scope",
      confidence: 0.95,
      reasoning: "Empty comment; no actionable instruction."
    };
  } else if (lowSignalPatterns.some((pattern) => pattern.test(normalized))) {
    result = {
      comment_id: comment.id,
      classification: "out_of_scope",
      confidence: 0.9,
      reasoning: "Low-signal acknowledgment with no implementation instruction."
    };
  } else if (ambiguityPatterns.some((pattern) => pattern.test(normalized))) {
    result = {
      comment_id: comment.id,
      classification: "needs_clarification",
      confidence: 0.65,
      reasoning: "Comment is ambiguous or speculative and should be clarified before implementation."
    };
  } else if (questionPatterns.some((pattern) => pattern.test(rawBody)) && !actionablePatterns.some((pattern) => pattern.test(normalized))) {
    result = {
      comment_id: comment.id,
      classification: "question",
      confidence: 0.85,
      reasoning: "Comment asks a question rather than giving a direct implementation instruction."
    };
  } else if (actionablePatterns.some((pattern) => pattern.test(normalized))) {
    result = {
      comment_id: comment.id,
      classification: "actionable",
      confidence: 0.9,
      reasoning: "Comment contains explicit implementation direction."
    };
  } else {
    result = {
      comment_id: comment.id,
      classification: "needs_clarification",
      confidence: 0.6,
      reasoning: "Unable to confidently classify intent from comment text."
    };
  }
  return applyTriageConfidenceFloor(result);
}
function runTriageClassificationLoop(comments) {
  return comments.map((comment) => classifyTriageComment(comment));
}
function shouldPauseForHumanFeedback(issue) {
  return issue.blocked_on_human === true;
}
function getUnprocessedTriageComments(issue, comments) {
  const processed = new Set(issue.processed_comment_ids ?? []);
  return comments.filter((comment) => !processed.has(comment.id));
}
var TRIAGE_COMMENT_FOOTER = "---\n*This comment was generated by aloop triage agent.*";
function formatNeedsClarificationReply(comment) {
  return [
    `Thanks for the feedback, @${comment.author}.`,
    "",
    "I want to make sure we implement exactly what you intended. Could you clarify the requested change with concrete acceptance criteria?",
    TRIAGE_COMMENT_FOOTER
  ].join("\n");
}
function formatQuestionReply(comment) {
  return [
    `Thanks for the question, @${comment.author}.`,
    "",
    "Based on the current issue context, this requires human clarification before implementation can proceed safely. Please provide specific direction and expected outcome.",
    TRIAGE_COMMENT_FOOTER
  ].join("\n");
}
function isAgentGeneratedComment(comment) {
  const normalizedAuthor = comment.author.toLowerCase();
  return comment.body.includes("This comment was generated by aloop triage agent.") || normalizedAuthor.includes("aloop-bot") || normalizedAuthor.endsWith("[bot]");
}
function isExternalAuthor(comment) {
  const association = (comment.author_association ?? "").toUpperCase();
  if (!association)
    return false;
  const trustedAssociations = /* @__PURE__ */ new Set(["OWNER", "MEMBER", "COLLABORATOR", "CONTRIBUTOR"]);
  return !trustedAssociations.has(association);
}
function formatSteeringComment(comment, issue) {
  return `From issue #${issue.number} comment by @${comment.author}:

${comment.body}`;
}
function formatSteeringContent(comments, issue) {
  const sections = comments.map((comment) => formatSteeringComment(comment, issue));
  return `# Steering Injection

${sections.join("\n\n---\n\n")}
`;
}
async function injectSteeringToChildLoop(issue, comments, deps) {
  if (!deps.writeFile || !deps.aloopRoot || !issue.child_session)
    return;
  const childSessionDir = path14.join(deps.aloopRoot, "sessions", issue.child_session);
  const steeringDoc = formatSteeringContent(comments, issue);
  const steeringPath = path14.join(childSessionDir, "worktree", "STEERING.md");
  await deps.writeFile(steeringPath, steeringDoc, "utf8");
  const steerTemplatePath = path14.join(childSessionDir, "prompts", "PROMPT_steer.md");
  let steerPromptContent = steeringDoc;
  if (existsSync11(steerTemplatePath)) {
    const templateContent = await readFile10(steerTemplatePath, "utf8");
    steerPromptContent = templateContent + "\n\n" + steeringDoc;
  }
  await writeQueueOverride(childSessionDir, "triage-steering", steerPromptContent, {
    agent: "steer",
    type: "triage_steering_override"
  });
}
async function applyTriageResultsToIssue(issue, comments, repo, deps) {
  const pendingSteeringComments = issue.pending_steering_comments ?? [];
  if (issue.child_session && pendingSteeringComments.length > 0) {
    await injectSteeringToChildLoop(issue, pendingSteeringComments, deps);
    issue.pending_steering_comments = [];
  }
  const newComments = getUnprocessedTriageComments(issue, comments);
  if (newComments.length === 0) {
    return [];
  }
  const classifications = runTriageClassificationLoop(newComments);
  const timestamp = deps.now().toISOString();
  const processed = new Set(issue.processed_comment_ids ?? []);
  const triageLog = issue.triage_log ?? [];
  const entries = [];
  for (let i = 0; i < newComments.length; i++) {
    const comment = newComments[i];
    const result = classifications[i];
    let actionTaken;
    if (isAgentGeneratedComment(comment)) {
      processed.add(comment.id);
      continue;
    }
    if (isExternalAuthor(comment)) {
      processed.add(comment.id);
      const entry2 = {
        comment_id: comment.id,
        author: comment.author,
        classification: "out_of_scope",
        confidence: 1,
        action_taken: "untriaged_external_comment",
        timestamp
      };
      triageLog.push(entry2);
      entries.push(entry2);
      continue;
    }
    if (result.classification === "needs_clarification") {
      await deps.execGh([
        "issue",
        "comment",
        String(issue.number),
        "--repo",
        repo,
        "--body",
        formatNeedsClarificationReply(comment)
      ]);
      if (!issue.blocked_on_human) {
        await deps.execGh([
          "issue",
          "edit",
          String(issue.number),
          "--repo",
          repo,
          "--add-label",
          "aloop/blocked-on-human"
        ]);
      }
      issue.blocked_on_human = true;
      actionTaken = "post_reply_and_block";
    } else if (result.classification === "actionable") {
      let unblocked = false;
      if (issue.blocked_on_human) {
        await deps.execGh([
          "issue",
          "edit",
          String(issue.number),
          "--repo",
          repo,
          "--remove-label",
          "aloop/blocked-on-human"
        ]);
        issue.blocked_on_human = false;
        unblocked = true;
      }
      if (issue.child_session) {
        const pendingSteeringComments2 = issue.pending_steering_comments ?? [];
        const commentsToInject = pendingSteeringComments2.length > 0 ? [...pendingSteeringComments2, comment] : [comment];
        await injectSteeringToChildLoop(issue, commentsToInject, deps);
        issue.pending_steering_comments = [];
        actionTaken = unblocked ? "unblock_and_steering" : "steering_injected";
      } else {
        const pendingSteeringComments2 = issue.pending_steering_comments ?? [];
        if (!pendingSteeringComments2.some((pendingComment) => pendingComment.id === comment.id)) {
          pendingSteeringComments2.push(comment);
        }
        issue.pending_steering_comments = pendingSteeringComments2;
        actionTaken = "steering_deferred";
      }
    } else if (result.classification === "question") {
      await deps.execGh([
        "issue",
        "comment",
        String(issue.number),
        "--repo",
        repo,
        "--body",
        formatQuestionReply(comment)
      ]);
      actionTaken = "question_answered";
    } else {
      actionTaken = "triaged_no_action";
    }
    processed.add(comment.id);
    const entry = {
      comment_id: comment.id,
      author: comment.author,
      classification: result.classification,
      confidence: result.confidence,
      action_taken: actionTaken,
      timestamp
    };
    triageLog.push(entry);
    entries.push(entry);
  }
  issue.processed_comment_ids = Array.from(processed);
  issue.triage_log = triageLog;
  issue.last_comment_check = timestamp;
  return entries;
}
function parsePositiveInteger2(value) {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}
function parseNumberFromUrl(url, pattern) {
  if (typeof url !== "string") {
    return null;
  }
  const match = url.match(pattern);
  if (!match) {
    return null;
  }
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
function extractCommentsPayload(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return [];
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.comments)) {
      return parsed.comments;
    }
  } catch {
    return [];
  }
  return [];
}
function normalizeMonitorComments(rawComments, context) {
  const result = [];
  for (const raw of rawComments) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const obj = raw;
    const id = parsePositiveInteger2(obj.id);
    const body = typeof obj.body === "string" ? obj.body : "";
    const author = typeof obj.author === "string" ? obj.author : typeof obj.user?.login === "string" ? obj.user.login : "unknown";
    if (id === null) {
      continue;
    }
    let issueNumber = null;
    if (context === "issue") {
      issueNumber = parsePositiveInteger2(obj.issue_number) ?? parseNumberFromUrl(obj.issue_url, /\/issues\/(\d+)(?:\/)?$/);
    } else {
      issueNumber = parsePositiveInteger2(obj.pull_request_number) ?? parseNumberFromUrl(obj.pull_request_url, /\/pulls\/(\d+)(?:\/)?$/);
    }
    result.push({
      issueNumber,
      comment: {
        id,
        author,
        body,
        context,
        created_at: typeof obj.created_at === "string" ? obj.created_at : void 0,
        author_association: typeof obj.author_association === "string" ? obj.author_association : void 0
      }
    });
  }
  return result;
}
async function runTriageMonitorCycle(state, sessionId, repo, deps, aloopRoot) {
  if (!deps.execGh) {
    return { processed_issues: 0, triaged_entries: 0 };
  }
  let triagedEntries = 0;
  for (const issue of state.issues) {
    const since = issue.last_comment_check ?? state.created_at;
    const issueCommentsResponse = await deps.execGh([
      "issue-comments",
      "--session",
      sessionId,
      "--since",
      since,
      "--role",
      "orchestrator"
    ]);
    const prCommentsResponse = await deps.execGh([
      "pr-comments",
      "--session",
      sessionId,
      "--since",
      since,
      "--role",
      "orchestrator"
    ]);
    const normalizedIssueComments = normalizeMonitorComments(
      extractCommentsPayload(issueCommentsResponse.stdout),
      "issue"
    ).filter((entry) => entry.issueNumber === issue.number).map((entry) => entry.comment);
    const normalizedPrComments = normalizeMonitorComments(
      extractCommentsPayload(prCommentsResponse.stdout),
      "pr"
    ).filter((entry) => issue.pr_number !== null && entry.issueNumber === issue.pr_number).map((entry) => entry.comment);
    const entries = await applyTriageResultsToIssue(
      issue,
      [...normalizedIssueComments, ...normalizedPrComments],
      repo,
      { execGh: deps.execGh, now: deps.now, writeFile: deps.writeFile, aloopRoot }
    );
    triagedEntries += entries.length;
    issue.last_comment_check = deps.now().toISOString();
  }
  state.updated_at = deps.now().toISOString();
  return { processed_issues: state.issues.length, triaged_entries: triagedEntries };
}
function parseSpecQuestionIssueList(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed)
    return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed))
      return [];
    return parsed.filter((issue) => Boolean(issue) && typeof issue === "object").map((issue) => ({
      number: parsePositiveInteger2(issue.number) ?? 0,
      title: typeof issue.title === "string" ? issue.title : "",
      body: typeof issue.body === "string" ? issue.body : "",
      labels: Array.isArray(issue.labels) ? issue.labels : []
    })).filter((issue) => issue.number > 0);
  } catch {
    return [];
  }
}
function extractLabelNames(labels) {
  const names = /* @__PURE__ */ new Set();
  for (const label of labels) {
    if (typeof label?.name === "string" && label.name.length > 0) {
      names.add(label.name.toLowerCase());
    }
  }
  return names;
}
function classifySpecQuestionRisk(issue) {
  const haystack = `${issue.title}
${issue.body}`.toLowerCase();
  if (/(security|privacy|billing|payment|architecture|breaking change|data retention|compliance)/.test(haystack)) {
    return "high";
  }
  if (/(api|contract|schema|data model|auth flow|error handling|migration|backward compatibility)/.test(haystack)) {
    return "medium";
  }
  return "low";
}
function resolveSpecQuestionAction(autonomy, risk) {
  if (autonomy === "autonomous")
    return "auto_resolve";
  if (autonomy === "balanced")
    return risk === "low" ? "auto_resolve" : "wait_for_user";
  return "wait_for_user";
}
function formatResolverDecisionComment(autonomy, risk) {
  return `## Resolver Decision (auto-resolved \u2014 ${autonomy} mode)

**Risk**: ${risk}
**Decision**: Proceed with the most conservative implementation choice consistent with current SPEC.

**Rationale**: The issue was classified as ${risk}-risk under ${autonomy} autonomy, which allows autonomous resolution for this risk tier.

**Spec backfill**: Decision captured for follow-up spec backfill by orchestrator consistency flow.

---
*This comment was generated by aloop resolver agent.*`;
}
async function resolveSpecQuestionIssues(state, repo, sessionDir, deps) {
  if (!deps.execGh) {
    return { processed: 0, waiting: 0, autoResolved: 0, userOverrides: 0 };
  }
  const result = { processed: 0, waiting: 0, autoResolved: 0, userOverrides: 0 };
  const response = await deps.execGh([
    "issue",
    "list",
    "--repo",
    repo,
    "--label",
    "aloop/spec-question",
    "--state",
    "open",
    "--json",
    "number,title,body,labels"
  ]);
  const issues = parseSpecQuestionIssueList(response.stdout);
  for (const issue of issues) {
    result.processed += 1;
    const labelNames = extractLabelNames(issue.labels);
    const issueNumber = String(issue.number);
    const risk = classifySpecQuestionRisk(issue);
    const action = resolveSpecQuestionAction(state.autonomy_level ?? "balanced", risk);
    const reopenedByUser = labelNames.has("aloop/auto-resolved");
    if (reopenedByUser) {
      if (!labelNames.has("aloop/blocked-on-human")) {
        await deps.execGh([
          "issue",
          "edit",
          issueNumber,
          "--repo",
          repo,
          "--add-label",
          "aloop/blocked-on-human"
        ]);
      }
      result.userOverrides += 1;
      deps.appendLog(sessionDir, {
        timestamp: deps.now().toISOString(),
        event: "spec_question_user_override",
        issue_number: issue.number,
        autonomy_level: state.autonomy_level ?? "balanced"
      });
      continue;
    }
    if (action === "wait_for_user") {
      if (!labelNames.has("aloop/blocked-on-human")) {
        await deps.execGh([
          "issue",
          "edit",
          issueNumber,
          "--repo",
          repo,
          "--add-label",
          "aloop/blocked-on-human"
        ]);
      }
      result.waiting += 1;
      deps.appendLog(sessionDir, {
        timestamp: deps.now().toISOString(),
        event: "spec_question_waiting",
        issue_number: issue.number,
        risk,
        autonomy_level: state.autonomy_level ?? "balanced"
      });
      continue;
    }
    await deps.execGh([
      "issue",
      "comment",
      issueNumber,
      "--repo",
      repo,
      "--body",
      formatResolverDecisionComment(state.autonomy_level ?? "balanced", risk)
    ]);
    await deps.execGh([
      "issue",
      "edit",
      issueNumber,
      "--repo",
      repo,
      "--add-label",
      "aloop/auto-resolved",
      "--remove-label",
      "aloop/blocked-on-human"
    ]);
    await deps.execGh(["issue", "close", issueNumber, "--repo", repo]);
    result.autoResolved += 1;
    deps.appendLog(sessionDir, {
      timestamp: deps.now().toISOString(),
      event: "spec_question_auto_resolved",
      issue_number: issue.number,
      risk,
      autonomy_level: state.autonomy_level ?? "balanced"
    });
  }
  return result;
}
var SPEC_QUESTION_BLOCKER = /aloop\/spec-question/i;
function validateDoR(issue) {
  const gaps = [];
  const body = `${issue.title}
${issue.body ?? ""}`;
  const hasAcceptanceCriteria = /acceptance\s*criteria/i.test(body) || /\[ \]/.test(body) || /accepts?/i.test(body);
  if (!hasAcceptanceCriteria) {
    gaps.push("Missing acceptance criteria");
  }
  if (SPEC_QUESTION_BLOCKER.test(body)) {
    gaps.push("Has unresolved spec-question blocker reference");
  }
  const hasPlannerApproach = /approach/i.test(body) || /implementation/i.test(body) || body.trim().length > 200;
  if (!hasPlannerApproach) {
    gaps.push("Missing planner approach or implementation notes");
  }
  if (issue.dor_validated !== true) {
    gaps.push("Estimation/DoR validation not completed");
  }
  return { passed: gaps.length === 0, gaps };
}
var REFINEMENT_BUDGET_CAP = 5;
function classifyGapRisk(gaps) {
  if (!gaps || gaps.length === 0)
    return "low";
  const highRiskTerms = ["security", "auth", "data loss", "breaking", "migration", "compliance"];
  const text = gaps.join(" ").toLowerCase();
  if (highRiskTerms.some((term) => text.includes(term)))
    return "high";
  if (gaps.length > 3)
    return "medium";
  return "low";
}
function resolveRefinementBudgetAction(autonomy, gapRisk) {
  if (autonomy === "autonomous")
    return true;
  if (autonomy === "balanced")
    return gapRisk === "low";
  return false;
}
async function applyEstimateResults(state, results, deps) {
  const outcome = { updated: [], blocked: [], budgetExceeded: [] };
  const issueByNumber = /* @__PURE__ */ new Map();
  for (const issue of state.issues) {
    issueByNumber.set(issue.number, issue);
  }
  const autonomyLevel = state.autonomy_level ?? "balanced";
  for (const result of results) {
    const issue = issueByNumber.get(result.issue_number);
    if (!issue)
      continue;
    if (result.dor_passed) {
      issue.dor_validated = true;
      if (issue.status === "Needs refinement") {
        issue.status = "Ready";
      }
      if (deps?.execGh && deps.repo) {
        await syncIssueProjectStatus(result.issue_number, deps.repo, "Ready", {
          execGh: deps.execGh,
          appendLog: deps.appendLog,
          now: deps.now,
          sessionDir: deps.sessionDir
        });
      }
      outcome.updated.push(result.issue_number);
    } else {
      issue.dor_validated = false;
      issue.refinement_count = (issue.refinement_count ?? 0) + 1;
      if (issue.refinement_count >= REFINEMENT_BUDGET_CAP) {
        issue.refinement_budget_exceeded = true;
        outcome.budgetExceeded.push(result.issue_number);
        const gapRisk = classifyGapRisk(result.gaps);
        const shouldAutoResolve = resolveRefinementBudgetAction(autonomyLevel, gapRisk);
        if (shouldAutoResolve) {
          issue.status = "Ready";
          issue.dor_validated = true;
          outcome.updated.push(result.issue_number);
          deps?.appendLog?.(deps.sessionDir ?? "", {
            timestamp: (deps?.now?.() ?? /* @__PURE__ */ new Date()).toISOString(),
            event: "refinement_budget_auto_resolved",
            issue_number: result.issue_number,
            refinement_count: issue.refinement_count,
            autonomy_level: autonomyLevel,
            gap_risk: gapRisk
          });
          continue;
        } else {
          issue.status = "Blocked";
          deps?.appendLog?.(deps.sessionDir ?? "", {
            timestamp: (deps?.now?.() ?? /* @__PURE__ */ new Date()).toISOString(),
            event: "refinement_budget_exceeded",
            issue_number: result.issue_number,
            refinement_count: issue.refinement_count,
            autonomy_level: autonomyLevel,
            gap_risk: gapRisk
          });
        }
      }
      outcome.blocked.push(result.issue_number);
      if (result.gaps && result.gaps.length > 0 && deps?.execGhIssueCreate && deps.repo && deps.sessionId) {
        for (const gap of result.gaps) {
          await deps.execGhIssueCreate(
            deps.repo,
            deps.sessionId,
            `[spec-question] #${result.issue_number}: ${gap}`,
            `Blocking issue #${result.issue_number} (${issue.title}).

**DoR gap:** ${gap}

This spec-question must be resolved before the parent issue can be dispatched.`,
            ["aloop/spec-question"]
          );
        }
      }
    }
  }
  return outcome;
}
async function queueEstimateForIssues(issues, queueDir, estimatePrompt, deps) {
  const targets = issues.filter(
    (issue) => issue.status === "Needs refinement" && issue.dor_validated !== true && !issue.refinement_budget_exceeded
  );
  if (targets.length === 0)
    return 0;
  for (const issue of targets) {
    const contextBlock = [
      `## Issue #${issue.number}: ${issue.title}`,
      "",
      issue.body ?? "(no body)",
      "",
      `**Wave:** ${issue.wave}`,
      `**Dependencies:** ${issue.depends_on.length > 0 ? issue.depends_on.map((d) => `#${d}`).join(", ") : "none"}`
    ].join("\n");
    const content = [
      "---",
      JSON.stringify({
        agent: "orch_estimate",
        reasoning: "high",
        type: "estimate_override",
        issue_number: issue.number
      }, null, 2),
      "---",
      "",
      estimatePrompt,
      "",
      "## Context",
      "",
      contextBlock,
      "",
      "Produce your output as a JSON code block with fields: `issue_number`, `dor_passed`, `complexity_tier`, `iteration_estimate`, `risk_flags`, `confidence`, `gaps`."
    ].join("\n");
    const fileName = `estimate-issue-${issue.number}.md`;
    await deps.writeFile(path14.join(queueDir, fileName), content, "utf8");
  }
  return targets.length;
}
async function createGapAnalysisRequests(issues, requestsDir, deps) {
  const targets = issues.filter((issue) => issue.status === "Needs analysis").map((issue) => ({
    issue_number: issue.number,
    title: issue.title,
    body: issue.body ?? "",
    wave: issue.wave
  }));
  if (targets.length === 0)
    return { product: false, architecture: false };
  const productRequest = {
    type: "product_analyst_review",
    prompt_template: ORCH_PRODUCT_ANALYST_PROMPT_FILENAME,
    generated_at: deps.now().toISOString(),
    targets
  };
  await deps.writeFile(
    path14.join(requestsDir, "product-analyst-review.json"),
    `${JSON.stringify(productRequest, null, 2)}
`,
    "utf8"
  );
  const archRequest = {
    type: "architecture_analyst_review",
    prompt_template: ORCH_ARCH_ANALYST_PROMPT_FILENAME,
    generated_at: deps.now().toISOString(),
    targets
  };
  await deps.writeFile(
    path14.join(requestsDir, "architecture-analyst-review.json"),
    `${JSON.stringify(archRequest, null, 2)}
`,
    "utf8"
  );
  return { product: true, architecture: true };
}
async function queueGapAnalysisForIssues(issues, queueDir, productAnalystPrompt, archAnalystPrompt, specContent, deps) {
  const targets = issues.filter((issue) => issue.status === "Needs analysis");
  if (targets.length === 0)
    return 0;
  const issueContext = targets.map(
    (issue) => `### Issue #${issue.number}: ${issue.title}

${issue.body ?? "(no body)"}

**Wave:** ${issue.wave}`
  ).join("\n\n---\n\n");
  const productContent = [
    "---",
    JSON.stringify(
      { agent: "orch_product_analyst", reasoning: "xhigh", type: "gap_analysis" },
      null,
      2
    ),
    "---",
    "",
    productAnalystPrompt,
    "",
    "## Spec",
    "",
    specContent,
    "",
    "## Issues Under Analysis",
    "",
    issueContext,
    "",
    "For each gap found, write a `requests/req-NNN-create_issues.json` file with `aloop/spec-question` label. If no gaps, do nothing."
  ].join("\n");
  await deps.writeFile(path14.join(queueDir, "gap-analysis-product.md"), productContent, "utf8");
  const archContent = [
    "---",
    JSON.stringify(
      { agent: "orch_arch_analyst", reasoning: "xhigh", type: "gap_analysis" },
      null,
      2
    ),
    "---",
    "",
    archAnalystPrompt,
    "",
    "## Spec",
    "",
    specContent,
    "",
    "## Issues Under Analysis",
    "",
    issueContext,
    "",
    "For each gap found, write a `requests/req-NNN-create_issues.json` file with `aloop/spec-question` label. If no gaps, do nothing."
  ].join("\n");
  await deps.writeFile(path14.join(queueDir, "gap-analysis-architecture.md"), archContent, "utf8");
  return targets.length;
}
async function createEpicDecompositionRequest(specFile, requestsDir, deps) {
  const request = {
    type: "epic_decomposition",
    prompt_template: ORCH_DECOMPOSE_PROMPT_FILENAME,
    generated_at: deps.now().toISOString(),
    spec_file: specFile
  };
  await deps.writeFile(
    path14.join(requestsDir, "epic-decomposition.json"),
    `${JSON.stringify(request, null, 2)}
`,
    "utf8"
  );
}
async function queueEpicDecomposition(specFile, specContent, queueDir, decomposePrompt, deps) {
  const content = [
    "---",
    JSON.stringify(
      { agent: "orch_decompose", reasoning: "xhigh", type: "epic_decomposition" },
      null,
      2
    ),
    "---",
    "",
    decomposePrompt,
    "",
    `## Spec File`,
    "",
    specFile,
    "",
    "## Spec",
    "",
    specContent,
    "",
    'Write decomposition output to `requests/epic-decomposition-results.json` as a `{"issues":[...]}` plan object.'
  ].join("\n");
  await deps.writeFile(path14.join(queueDir, "decompose-epics.md"), content, "utf8");
}
async function createSubDecompositionRequests(issues, requestsDir, deps) {
  const targets = issues.filter((issue) => issue.status === "Needs decomposition").map((issue) => ({
    issue_number: issue.number,
    title: issue.title,
    body: issue.body ?? "",
    depends_on: issue.depends_on,
    wave: issue.wave,
    file_hints: issue.file_hints ?? []
  }));
  if (targets.length === 0)
    return 0;
  const request = {
    type: "sub_issue_decomposition",
    prompt_template: ORCH_SUB_DECOMPOSE_PROMPT_FILENAME,
    generated_at: deps.now().toISOString(),
    targets
  };
  await deps.writeFile(
    path14.join(requestsDir, "sub-issue-decomposition.json"),
    `${JSON.stringify(request, null, 2)}
`,
    "utf8"
  );
  return targets.length;
}
async function queueSubDecompositionForIssues(issues, queueDir, subDecomposePrompt, deps) {
  const targets = issues.filter((issue) => issue.status === "Needs decomposition");
  if (targets.length === 0)
    return 0;
  for (const issue of targets) {
    const content = [
      "---",
      JSON.stringify(
        { agent: "orch_sub_decompose", reasoning: "xhigh", type: "sub_issue_decomposition", issue_number: issue.number },
        null,
        2
      ),
      "---",
      "",
      subDecomposePrompt,
      "",
      `## Epic Issue #${issue.number}: ${issue.title}`,
      "",
      issue.body ?? "(no body)",
      "",
      `## Wave`,
      "",
      String(issue.wave),
      "",
      `## Dependency Issue Numbers`,
      "",
      issue.depends_on.length > 0 ? issue.depends_on.join(", ") : "(none)",
      "",
      "Write decomposition output to `requests/sub-decomposition-results.json` as an array of parent issue updates."
    ].join("\n");
    await deps.writeFile(path14.join(queueDir, `sub-decompose-issue-${issue.number}.md`), content, "utf8");
  }
  return targets.length;
}
function applySubDecompositionResults(state, results, now) {
  if (!Array.isArray(results) || results.length === 0)
    return state;
  const byParent = /* @__PURE__ */ new Map();
  for (const result of results) {
    byParent.set(result.parent_issue_number, result);
  }
  let touched = false;
  for (const issue of state.issues) {
    const result = byParent.get(issue.number);
    if (!result)
      continue;
    issue.status = result.status ?? "Needs refinement";
    issue.dor_validated = false;
    if (result.refined_body)
      issue.body = result.refined_body;
    if (result.file_hints)
      issue.file_hints = [...result.file_hints];
    touched = true;
  }
  if (touched) {
    state.updated_at = now.toISOString();
  }
  return state;
}
function getDispatchableIssues(state) {
  if (state.current_wave === 0 || state.issues.length === 0) {
    return [];
  }
  const issueByNumber = /* @__PURE__ */ new Map();
  for (const issue of state.issues) {
    issueByNumber.set(issue.number, issue);
  }
  return state.issues.filter((issue) => {
    if (issue.wave !== state.current_wave)
      return false;
    if (issue.status && issue.status !== "Ready")
      return false;
    if (issue.state !== "pending")
      return false;
    if (shouldPauseForHumanFeedback(issue))
      return false;
    if (!validateDoR(issue).passed)
      return false;
    for (const depNumber of issue.depends_on) {
      const dep = issueByNumber.get(depNumber);
      if (!dep || dep.state !== "merged")
        return false;
    }
    return true;
  });
}
function countActiveChildren(state) {
  return state.issues.filter((i) => i.state === "in_progress").length;
}
function availableSlots(state) {
  return Math.max(0, state.concurrency_cap - countActiveChildren(state));
}
function hasFileOwnershipConflict(issue, activeIssues) {
  const candidateHints = issue.file_hints;
  if (!candidateHints || candidateHints.length === 0)
    return false;
  for (const active of activeIssues) {
    const activeHints = active.file_hints;
    if (!activeHints || activeHints.length === 0)
      continue;
    for (const hint of candidateHints) {
      if (activeHints.includes(hint))
        return true;
    }
  }
  return false;
}
function filterByFileOwnership(candidates, state) {
  const activeIssues = state.issues.filter((i) => i.state === "in_progress");
  const selected = [];
  for (const candidate of candidates) {
    if (!hasFileOwnershipConflict(candidate, [...activeIssues, ...selected])) {
      selected.push(candidate);
    }
  }
  return selected;
}
function detectHostCapabilities(deps) {
  const capabilities = /* @__PURE__ */ new Set();
  if (deps.platform === "win32")
    capabilities.add("windows");
  if (deps.platform === "darwin")
    capabilities.add("macos");
  if (deps.platform === "linux")
    capabilities.add("linux");
  capabilities.add("network-access");
  try {
    const docker = deps.spawnSync("docker", ["--version"], { encoding: "utf8" });
    if (docker.status === 0)
      capabilities.add("docker");
  } catch {
  }
  const gpuEnv = deps.env.NVIDIA_VISIBLE_DEVICES && deps.env.NVIDIA_VISIBLE_DEVICES !== "none" || deps.env.CUDA_VISIBLE_DEVICES && deps.env.CUDA_VISIBLE_DEVICES.length > 0;
  if (gpuEnv) {
    capabilities.add("gpu");
  } else {
    try {
      const nvidiaSmi = deps.spawnSync("nvidia-smi", ["-L"], { encoding: "utf8" });
      if (nvidiaSmi.status === 0)
        capabilities.add("gpu");
    } catch {
    }
  }
  return capabilities;
}
function filterByHostCapabilities(candidates, deps) {
  const capabilities = detectHostCapabilities(deps);
  const eligible = [];
  const blocked = [];
  for (const issue of candidates) {
    const requires = normalizeTaskRequires(issue.requires);
    const missing = requires.filter((label) => !capabilities.has(label));
    if (missing.length === 0) {
      eligible.push(issue);
    } else {
      blocked.push({ issue, missing });
    }
  }
  return { eligible, blocked };
}
function formatChildSessionId(projectName, issueNumber, now) {
  const timestamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}-${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}${String(now.getUTCSeconds()).padStart(2, "0")}`;
  const sanitized = projectName.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  return `${sanitized}-issue-${issueNumber}-${timestamp}`;
}
async function launchChildLoop(issue, orchestratorSessionDir, projectRoot, projectName, promptsSourceDir, aloopRoot, deps) {
  const sandbox = normalizeTaskSandbox(issue.sandbox);
  const requires = normalizeTaskRequires(issue.requires);
  const now = deps.now();
  const sessionId = formatChildSessionId(projectName, issue.number, now);
  const sessionsRoot = path14.join(aloopRoot, "sessions");
  const sessionDir = path14.join(sessionsRoot, sessionId);
  const branchName = `aloop/issue-${issue.number}`;
  const worktreePath = path14.join(sessionDir, "worktree");
  const promptsDir = path14.join(sessionDir, "prompts");
  await deps.mkdir(sessionDir, { recursive: true });
  await deps.cp(promptsSourceDir, promptsDir, { recursive: true });
  const worktreeResult = deps.spawnSync("git", ["-C", projectRoot, "worktree", "add", worktreePath, "-b", branchName], { encoding: "utf8" });
  if (worktreeResult.status !== 0) {
    throw new Error(`Failed to create worktree for issue #${issue.number}: ${worktreeResult.stderr || worktreeResult.stdout}`);
  }
  const todoContent = `# Issue #${issue.number}: ${issue.title}

## Tasks

- [ ] Implement as described in the issue
`;
  await deps.writeFile(path14.join(worktreePath, "TODO.md"), todoContent, "utf8");
  const configJson = {
    repo: null,
    // Will be set by orchestrator if repo is known
    assignedIssueNumber: issue.number,
    childCreatedPrNumbers: [],
    role: "child-loop",
    orchestrator_session: path14.basename(orchestratorSessionDir)
  };
  await deps.writeFile(path14.join(sessionDir, "config.json"), `${JSON.stringify(configJson, null, 2)}
`, "utf8");
  const startedAt = now.toISOString();
  const meta = {
    session_id: sessionId,
    project_name: projectName,
    project_root: projectRoot,
    provider: "round-robin",
    mode: "plan-build-review",
    launch_mode: "start",
    worktree: true,
    worktree_path: worktreePath,
    work_dir: worktreePath,
    branch: branchName,
    prompts_dir: promptsDir,
    session_dir: sessionDir,
    issue_number: issue.number,
    sandbox,
    requires,
    orchestrator_session: path14.basename(orchestratorSessionDir),
    created_at: startedAt
  };
  await deps.writeFile(path14.join(sessionDir, "meta.json"), `${JSON.stringify(meta, null, 2)}
`, "utf8");
  await deps.writeFile(
    path14.join(sessionDir, "status.json"),
    `${JSON.stringify({ state: "starting", mode: "plan-build-review", provider: "round-robin", iteration: 0, updated_at: startedAt }, null, 2)}
`,
    "utf8"
  );
  if (issue.body) {
    await deps.writeFile(path14.join(worktreePath, "SPEC.md"), `# Sub-Spec: Issue #${issue.number} \u2014 ${issue.title}

${issue.body}
`, "utf8");
  }
  await compileLoopPlan(
    {
      mode: "plan-build-review",
      provider: "round-robin",
      promptsDir,
      sessionDir,
      enabledProviders: ["claude", "codex", "gemini", "copilot", "opencode"],
      roundRobinOrder: ["claude", "codex", "gemini", "copilot", "opencode"],
      models: {},
      projectRoot: worktreePath
    },
    {
      readFile: deps.readFile,
      writeFile: deps.writeFile,
      existsSync: deps.existsSync
    }
  );
  const loopBinDir = path14.join(aloopRoot, "bin");
  let command;
  let args;
  if (deps.platform === "win32") {
    const loopScript = path14.join(loopBinDir, "loop.ps1");
    command = "powershell";
    args = [
      "-NoProfile",
      "-File",
      loopScript,
      "-PromptsDir",
      promptsDir,
      "-SessionDir",
      sessionDir,
      "-WorkDir",
      worktreePath,
      "-Mode",
      "plan-build-review",
      "-Provider",
      "round-robin",
      "-MaxIterations",
      "20",
      "-MaxStuck",
      "3",
      "-LaunchMode",
      "start"
    ];
  } else {
    const loopScript = path14.join(loopBinDir, "loop.sh");
    command = loopScript;
    args = [
      "--prompts-dir",
      promptsDir,
      "--session-dir",
      sessionDir,
      "--work-dir",
      worktreePath,
      "--mode",
      "plan-build-review",
      "--provider",
      "round-robin",
      "--max-iterations",
      "20",
      "--max-stuck",
      "3",
      "--launch-mode",
      "start"
    ];
  }
  const child = deps.spawn(command, args, {
    cwd: worktreePath,
    detached: true,
    stdio: "ignore",
    env: {
      ...deps.env,
      ALOOP_TASK_SANDBOX: sandbox,
      ALOOP_TASK_REQUIRES: requires.join(",")
    },
    windowsHide: true
  });
  child.unref();
  const pid = child.pid;
  if (!pid) {
    throw new Error(`Failed to launch loop process for issue #${issue.number}`);
  }
  meta.pid = pid;
  meta.started_at = startedAt;
  await deps.writeFile(path14.join(sessionDir, "meta.json"), `${JSON.stringify(meta, null, 2)}
`, "utf8");
  const activePath = path14.join(aloopRoot, "active.json");
  let active = {};
  try {
    if (deps.existsSync(activePath)) {
      active = JSON.parse(await deps.readFile(activePath, "utf8"));
    }
  } catch {
    active = {};
  }
  active[sessionId] = {
    session_id: sessionId,
    session_dir: sessionDir,
    project_name: projectName,
    project_root: projectRoot,
    pid,
    work_dir: worktreePath,
    started_at: startedAt,
    provider: "round-robin",
    mode: "plan-build-review"
  };
  await deps.writeFile(activePath, `${JSON.stringify(active, null, 2)}
`, "utf8");
  return {
    issue_number: issue.number,
    session_id: sessionId,
    session_dir: sessionDir,
    branch: branchName,
    worktree_path: worktreePath,
    pid
  };
}
var ORCHESTRATOR_CI_PERSISTENCE_LIMIT = 3;
async function hasGithubActionsWorkflows(repo, deps) {
  try {
    const response = await deps.execGh([
      "api",
      `repos/${repo}/actions/workflows`,
      "--method",
      "GET",
      "--jq",
      ".total_count"
    ]);
    const total = Number(response.stdout.trim());
    return Number.isFinite(total) && total > 0;
  } catch {
    return false;
  }
}
async function checkPrGates(prNumber, repo, deps) {
  const gates = [];
  const ciWorkflowsConfigured = await hasGithubActionsWorkflows(repo, deps);
  let mergeable = false;
  try {
    const viewResult = await deps.execGh([
      "pr",
      "view",
      String(prNumber),
      "--repo",
      repo,
      "--json",
      "mergeable,mergeStateStatus"
    ]);
    const prData = JSON.parse(viewResult.stdout);
    mergeable = prData.mergeable === "MERGEABLE";
    const mergeState = prData.mergeStateStatus ?? "UNKNOWN";
    gates.push({
      gate: "merge_conflicts",
      status: mergeable ? "pass" : "fail",
      detail: mergeable ? "No merge conflicts" : `Merge state: ${mergeState}`
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    gates.push({ gate: "merge_conflicts", status: "fail", detail: `Failed to check mergeability: ${msg}` });
  }
  try {
    const checksResult = await deps.execGh([
      "pr",
      "checks",
      String(prNumber),
      "--repo",
      repo,
      "--json",
      "name,state,conclusion"
    ]);
    const checks = JSON.parse(checksResult.stdout);
    const allCompleted = checks.every((c) => c.state === "COMPLETED" || c.state === "completed");
    const allPassed2 = checks.every(
      (c) => (c.state === "COMPLETED" || c.state === "completed") && (c.conclusion === "SUCCESS" || c.conclusion === "success" || c.conclusion === "NEUTRAL" || c.conclusion === "neutral" || c.conclusion === "SKIPPED" || c.conclusion === "skipped")
    );
    const failedChecks = checks.filter(
      (c) => c.conclusion === "FAILURE" || c.conclusion === "failure" || c.conclusion === "CANCELLED" || c.conclusion === "cancelled" || c.conclusion === "TIMED_OUT" || c.conclusion === "timed_out"
    );
    if (checks.length === 0) {
      if (ciWorkflowsConfigured) {
        gates.push({ gate: "ci_checks", status: "pending", detail: "CI workflows detected but no check runs reported yet" });
      } else {
        gates.push({ gate: "ci_checks", status: "pass", detail: "No GitHub Actions workflows detected; local fallback validation required" });
      }
    } else if (!allCompleted) {
      gates.push({ gate: "ci_checks", status: "pending", detail: "Some CI checks still running" });
    } else if (allPassed2) {
      gates.push({ gate: "ci_checks", status: "pass", detail: `All ${checks.length} checks passed` });
    } else {
      const failNames = failedChecks.map((c) => c.name).join(", ");
      gates.push({ gate: "ci_checks", status: "fail", detail: `Failed checks: ${failNames}` });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (ciWorkflowsConfigured) {
      gates.push({ gate: "ci_checks", status: "fail", detail: `Failed to query CI checks: ${msg}` });
    } else {
      gates.push({ gate: "ci_checks", status: "pass", detail: `No GitHub Actions workflows detected; CI check query skipped (${msg})` });
    }
  }
  const allPassed = gates.every((g) => g.status === "pass");
  return { pr_number: prNumber, all_passed: allPassed, mergeable, gates };
}
async function reviewPrDiff(prNumber, repo, deps) {
  let diff;
  try {
    const diffResult = await deps.execGh(["pr", "diff", String(prNumber), "--repo", repo]);
    diff = diffResult.stdout;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      pr_number: prNumber,
      verdict: "flag-for-human",
      summary: `Failed to fetch PR diff: ${msg}`
    };
  }
  if (deps.invokeAgentReview) {
    return deps.invokeAgentReview(prNumber, repo, diff);
  }
  return {
    pr_number: prNumber,
    verdict: "approve",
    summary: "Auto-approved (no agent reviewer configured)"
  };
}
async function mergePr(prNumber, repo, deps) {
  try {
    await deps.execGh([
      "pr",
      "merge",
      String(prNumber),
      "--repo",
      repo,
      "--squash",
      "--delete-branch"
    ]);
    return { pr_number: prNumber, merged: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { pr_number: prNumber, merged: false, error: msg };
  }
}
async function createTrunkToMainPr(state, repo, deps, sessionDir) {
  const trunkBranch = state.trunk_branch || "agent/trunk";
  const mergedCount = state.issues.filter((i) => i.state === "merged").length;
  const failedCount = state.issues.filter((i) => i.state === "failed").length;
  const title = `[aloop] Promote ${trunkBranch} to main`;
  const body = [
    "## Summary",
    "",
    `All ${state.issues.length} sub-issues have reached terminal state.`,
    `- Merged: ${mergedCount}`,
    failedCount > 0 ? `- Failed: ${failedCount}` : "",
    "",
    `This PR promotes \`${trunkBranch}\` into \`main\` for human review.`,
    "",
    "_Created automatically by the aloop orchestrator._"
  ].filter(Boolean).join("\n");
  try {
    const result = await deps.execGh([
      "pr",
      "create",
      "--repo",
      repo,
      "--base",
      "main",
      "--head",
      trunkBranch,
      "--title",
      title,
      "--body",
      body
    ]);
    const parsed = parsePrCreateOutput(result.stdout);
    deps.appendLog(sessionDir, {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      event: "trunk_to_main_pr_created",
      pr_number: parsed.number,
      trunk_branch: trunkBranch
    });
    return parsed.number;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      const listResult = await deps.execGh([
        "pr",
        "list",
        "--repo",
        repo,
        "--head",
        trunkBranch,
        "--base",
        "main",
        "--json",
        "number",
        "--jq",
        ".[0].number"
      ]);
      const existingNumber = Number.parseInt(listResult.stdout.trim(), 10);
      if (Number.isFinite(existingNumber) && existingNumber > 0) {
        deps.appendLog(sessionDir, {
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          event: "trunk_to_main_pr_exists",
          pr_number: existingNumber,
          trunk_branch: trunkBranch
        });
        return existingNumber;
      }
    } catch {
    }
    deps.appendLog(sessionDir, {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      event: "trunk_to_main_pr_failed",
      error: msg,
      trunk_branch: trunkBranch
    });
    return null;
  }
}
async function requestRebase(issue, repo, trunkBranch, rebaseAttempt, deps) {
  const body = `Merge conflict with \`${trunkBranch}\` \u2014 rebase needed (attempt ${rebaseAttempt}/2).\\n\\nPlease rebase your branch against \`${trunkBranch}\` and push.`;
  await deps.execGh([
    "issue",
    "comment",
    String(issue.number),
    "--repo",
    repo,
    "--body",
    body
  ]);
}
async function flagForHuman(issue, repo, reason, deps) {
  const body = `Flagged for human resolution: ${reason}`;
  try {
    await deps.execGh([
      "issue",
      "comment",
      String(issue.number),
      "--repo",
      repo,
      "--body",
      body
    ]);
    await deps.execGh([
      "issue",
      "edit",
      String(issue.number),
      "--repo",
      repo,
      "--add-label",
      "aloop/blocked-on-human"
    ]);
  } catch {
  }
}
async function processPrLifecycle(issue, state, stateFile, sessionDir, repo, deps) {
  if (!issue.pr_number) {
    return { pr_number: 0, action: "gates_failed", detail: "No PR number on issue" };
  }
  const prNumber = issue.pr_number;
  const gatesResult = await checkPrGates(prNumber, repo, deps);
  deps.appendLog(sessionDir, {
    timestamp: deps.now().toISOString(),
    event: "pr_gates_checked",
    pr_number: prNumber,
    issue_number: issue.number,
    all_passed: gatesResult.all_passed,
    gates: gatesResult.gates
  });
  if (gatesResult.gates.some((g) => g.status === "pending")) {
    return { pr_number: prNumber, action: "gates_pending", detail: "CI checks still running", gates: gatesResult };
  }
  if (!gatesResult.mergeable) {
    const stateIssue = state.issues.find((i) => i.number === issue.number);
    const rebaseAttempts = stateIssue?.rebase_attempts ?? 0;
    if (rebaseAttempts >= 2) {
      await flagForHuman(issue, repo, `Merge conflicts persist after 2 rebase attempts on PR #${prNumber}`, deps);
      if (stateIssue) {
        stateIssue.state = "failed";
        stateIssue.status = "Blocked";
      }
      await syncIssueProjectStatus(issue.number, repo, "Blocked", {
        execGh: deps.execGh,
        appendLog: deps.appendLog,
        now: deps.now,
        sessionDir
      });
      state.updated_at = deps.now().toISOString();
      await deps.writeFile(stateFile, `${JSON.stringify(state, null, 2)}
`, "utf8");
      deps.appendLog(sessionDir, {
        timestamp: deps.now().toISOString(),
        event: "pr_flagged_for_human",
        pr_number: prNumber,
        issue_number: issue.number,
        reason: "max_rebase_attempts",
        attempts: rebaseAttempts
      });
      return { pr_number: prNumber, action: "flagged_for_human", detail: `Conflicts persist after 2 rebase attempts`, gates: gatesResult };
    }
    const attempt = rebaseAttempts + 1;
    await requestRebase(issue, repo, state.trunk_branch, attempt, deps);
    if (stateIssue)
      stateIssue.rebase_attempts = attempt;
    state.updated_at = deps.now().toISOString();
    await deps.writeFile(stateFile, `${JSON.stringify(state, null, 2)}
`, "utf8");
    deps.appendLog(sessionDir, {
      timestamp: deps.now().toISOString(),
      event: "pr_rebase_requested",
      pr_number: prNumber,
      issue_number: issue.number,
      attempt
    });
    return { pr_number: prNumber, action: "rebase_requested", detail: `Rebase requested (attempt ${attempt}/2)`, gates: gatesResult };
  }
  if (!gatesResult.all_passed) {
    const failedGates = gatesResult.gates.filter((g) => g.status === "fail");
    const failDetail = failedGates.map((g) => `${g.gate}: ${g.detail}`).join("; ");
    const ciFailure = failedGates.find((g) => g.gate === "ci_checks");
    const stateIssue = state.issues.find((i) => i.number === issue.number);
    if (ciFailure && stateIssue) {
      const signature = normalizeCiDetailForSignature(ciFailure.detail);
      const retries = stateIssue.ci_failure_signature === signature ? (stateIssue.ci_failure_retries ?? 0) + 1 : 1;
      stateIssue.ci_failure_signature = signature;
      stateIssue.ci_failure_retries = retries;
      stateIssue.ci_failure_summary = ciFailure.detail;
      if (retries >= ORCHESTRATOR_CI_PERSISTENCE_LIMIT) {
        await flagForHuman(
          issue,
          repo,
          `Persistent CI failure unchanged after ${retries} attempts: ${ciFailure.detail}`,
          deps
        );
        stateIssue.state = "failed";
        stateIssue.status = "Blocked";
        await syncIssueProjectStatus(issue.number, repo, "Blocked", {
          execGh: deps.execGh,
          appendLog: deps.appendLog,
          now: deps.now,
          sessionDir
        });
        state.updated_at = deps.now().toISOString();
        await deps.writeFile(stateFile, `${JSON.stringify(state, null, 2)}
`, "utf8");
        deps.appendLog(sessionDir, {
          timestamp: deps.now().toISOString(),
          event: "pr_ci_failure_persistent",
          pr_number: prNumber,
          issue_number: issue.number,
          ci_failure_retries: retries,
          ci_failure_summary: ciFailure.detail
        });
        return {
          pr_number: prNumber,
          action: "flagged_for_human",
          detail: `Persistent CI failure after ${retries} attempts`,
          gates: gatesResult
        };
      }
      state.updated_at = deps.now().toISOString();
      await deps.writeFile(stateFile, `${JSON.stringify(state, null, 2)}
`, "utf8");
    }
    try {
      const ciRetryNote = ciFailure && stateIssue ? ` CI retry ${stateIssue.ci_failure_retries ?? 1}/${ORCHESTRATOR_CI_PERSISTENCE_LIMIT} before human escalation.` : "";
      await deps.execGh([
        "issue",
        "comment",
        String(issue.number),
        "--repo",
        repo,
        "--body",
        `PR #${prNumber} failed gates: ${failDetail}.${ciRetryNote} Please address and update the PR.`
      ]);
    } catch {
    }
    deps.appendLog(sessionDir, {
      timestamp: deps.now().toISOString(),
      event: "pr_gates_failed",
      pr_number: prNumber,
      issue_number: issue.number,
      failed_gates: failedGates
    });
    return { pr_number: prNumber, action: "gates_failed", detail: failDetail, gates: gatesResult };
  }
  const reviewResult = await reviewPrDiff(prNumber, repo, deps);
  deps.appendLog(sessionDir, {
    timestamp: deps.now().toISOString(),
    event: "pr_agent_review",
    pr_number: prNumber,
    issue_number: issue.number,
    verdict: reviewResult.verdict,
    summary: reviewResult.summary
  });
  if (reviewResult.verdict === "pending") {
    return { pr_number: prNumber, action: "review_pending", detail: reviewResult.summary, gates: gatesResult, review: reviewResult };
  }
  if (reviewResult.verdict === "request-changes") {
    try {
      await deps.execGh([
        "issue",
        "comment",
        String(issue.number),
        "--repo",
        repo,
        "--body",
        `Agent review of PR #${prNumber} requested changes:\\n\\n${reviewResult.summary}`
      ]);
    } catch {
    }
    return { pr_number: prNumber, action: "rejected", detail: reviewResult.summary, gates: gatesResult, review: reviewResult };
  }
  if (reviewResult.verdict === "flag-for-human") {
    await flagForHuman(issue, repo, `Agent review flagged PR #${prNumber} for human: ${reviewResult.summary}`, deps);
    return { pr_number: prNumber, action: "flagged_for_human", detail: reviewResult.summary, gates: gatesResult, review: reviewResult };
  }
  const mergeResult = await mergePr(prNumber, repo, deps);
  if (mergeResult.merged) {
    const stateIssue = state.issues.find((i) => i.number === issue.number);
    if (stateIssue) {
      stateIssue.state = "merged";
      stateIssue.status = "Done";
    }
    await syncIssueProjectStatus(issue.number, repo, "Done", {
      execGh: deps.execGh,
      appendLog: deps.appendLog,
      now: deps.now,
      sessionDir
    });
    state.updated_at = deps.now().toISOString();
    await deps.writeFile(stateFile, `${JSON.stringify(state, null, 2)}
`, "utf8");
    deps.appendLog(sessionDir, {
      timestamp: deps.now().toISOString(),
      event: "pr_merged",
      pr_number: prNumber,
      issue_number: issue.number,
      merge_method: "squash"
    });
    try {
      await deps.execGh(["issue", "close", String(issue.number), "--repo", repo]);
    } catch {
    }
    return { pr_number: prNumber, action: "merged", detail: "Squash-merged successfully", gates: gatesResult, review: reviewResult };
  }
  deps.appendLog(sessionDir, {
    timestamp: deps.now().toISOString(),
    event: "pr_merge_failed",
    pr_number: prNumber,
    issue_number: issue.number,
    error: mergeResult.error
  });
  return { pr_number: prNumber, action: "gates_failed", detail: `Merge failed: ${mergeResult.error}`, gates: gatesResult, review: reviewResult };
}
function isWaveComplete(state, wave) {
  const waveIssues = state.issues.filter((i) => i.wave === wave);
  return waveIssues.length > 0 && waveIssues.every((i) => i.state === "merged" || i.state === "failed");
}
function advanceWave(state) {
  if (state.current_wave === 0)
    return false;
  if (!isWaveComplete(state, state.current_wave))
    return false;
  if (!state.completed_waves.includes(state.current_wave)) {
    state.completed_waves.push(state.current_wave);
  }
  const maxWave = Math.max(0, ...state.issues.map((i) => i.wave));
  if (state.current_wave < maxWave) {
    state.current_wave++;
    return true;
  }
  return false;
}
var DEFAULT_COST_PER_ITERATION_USD = 0.5;
async function parseChildSessionCost(sessionDir, sessionId, issueNumber, deps) {
  const logFile = path14.join(sessionDir, "log.jsonl");
  const providers = {};
  let iterations = 0;
  if (deps.existsSync(logFile)) {
    try {
      const content = await deps.readFile(logFile, "utf8");
      const lines = content.split("\n").filter((l) => l.trim().length > 0);
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.event === "iteration_complete") {
            iterations++;
            const provider = entry.provider ?? "unknown";
            providers[provider] = (providers[provider] ?? 0) + 1;
          }
        } catch {
        }
      }
    } catch {
    }
  }
  return {
    session_id: sessionId,
    issue_number: issueNumber,
    iterations,
    providers,
    estimated_cost_usd: iterations * DEFAULT_COST_PER_ITERATION_USD
  };
}
async function aggregateChildCosts(state, aloopRoot, deps) {
  const children = [];
  for (const issue of state.issues) {
    if (issue.child_session) {
      const childDir = path14.join(aloopRoot, "sessions", issue.child_session);
      const cost = await parseChildSessionCost(childDir, issue.child_session, issue.number, deps);
      children.push(cost);
    }
  }
  const totalCost = children.reduce((sum, c) => sum + c.estimated_cost_usd, 0);
  const budgetCap = state.budget_cap;
  return {
    budget_cap: budgetCap,
    total_estimated_cost_usd: totalCost,
    children,
    budget_exceeded: budgetCap !== null && totalCost >= budgetCap,
    budget_approaching: budgetCap !== null && totalCost >= budgetCap * 0.8 && totalCost < budgetCap
  };
}
function shouldPauseForBudget(budget) {
  return budget.budget_exceeded || budget.budget_approaching;
}
function parsePrCreateOutput(stdout) {
  const match = stdout.match(/\/pull\/(\d+)/);
  return {
    number: match ? Number.parseInt(match[1], 10) : null,
    url: stdout.trim()
  };
}
async function createPrForChild(issue, childSession, childDir, state, repo, deps) {
  const metaPath = path14.join(childDir, "meta.json");
  let branch = `aloop/issue-${issue.number}`;
  let projectRoot = "";
  if (deps.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(await deps.readFile(metaPath, "utf8"));
      if (typeof meta.branch === "string")
        branch = meta.branch;
      if (typeof meta.project_root === "string")
        projectRoot = meta.project_root;
    } catch {
    }
  }
  const baseBranch = state.trunk_branch || "agent/trunk";
  let effectiveBase = baseBranch;
  try {
    await deps.execGh(["api", `repos/${repo}/branches/${baseBranch}`, "--jq", ".name"]);
  } catch {
    effectiveBase = "main";
  }
  const issueTitle = issue.title || `Issue ${issue.number}`;
  const prTitle = `[aloop] ${issueTitle}`;
  const prBody = `Automated implementation for issue #${issue.number}.

Closes #${issue.number}`;
  try {
    const result = await deps.execGh([
      "pr",
      "create",
      "--repo",
      repo,
      "--base",
      effectiveBase,
      "--head",
      branch,
      "--title",
      prTitle,
      "--body",
      prBody
    ]);
    const parsed = parsePrCreateOutput(result.stdout);
    return { pr_number: parsed.number, branch, baseBranch: effectiveBase };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      const listResult = await deps.execGh([
        "pr",
        "list",
        "--repo",
        repo,
        "--head",
        branch,
        "--json",
        "number",
        "--jq",
        ".[0].number"
      ]);
      const existingNumber = Number.parseInt(listResult.stdout.trim(), 10);
      if (Number.isFinite(existingNumber) && existingNumber > 0) {
        return { pr_number: existingNumber, branch, baseBranch: effectiveBase };
      }
    } catch {
    }
    return { pr_number: null, branch, baseBranch: effectiveBase, error: msg };
  }
}
async function monitorChildSessions(state, sessionDir, repo, deps) {
  const result = {
    monitored: 0,
    prs_created: 0,
    failed: 0,
    still_running: 0,
    errors: 0,
    entries: []
  };
  const inProgressIssues = state.issues.filter(
    (i) => i.state === "in_progress" && i.child_session !== null
  );
  for (const issue of inProgressIssues) {
    const childSession = issue.child_session;
    const childDir = path14.join(deps.aloopRoot, "sessions", childSession);
    const statusPath = path14.join(childDir, "status.json");
    result.monitored++;
    let childStatus = null;
    try {
      if (deps.existsSync(statusPath)) {
        const raw = await deps.readFile(statusPath, "utf8");
        childStatus = JSON.parse(raw);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.errors++;
      result.entries.push({
        issue_number: issue.number,
        child_session: childSession,
        child_state: "unknown",
        stuck_count: 0,
        action: "status_unreadable",
        error: msg
      });
      deps.appendLog(sessionDir, {
        timestamp: deps.now().toISOString(),
        event: "child_monitor_error",
        issue_number: issue.number,
        child_session: childSession,
        error: msg
      });
      continue;
    }
    if (!childStatus) {
      result.errors++;
      result.entries.push({
        issue_number: issue.number,
        child_session: childSession,
        child_state: "unknown",
        stuck_count: 0,
        action: "status_unreadable",
        error: "status.json not found"
      });
      continue;
    }
    const entry = {
      issue_number: issue.number,
      child_session: childSession,
      child_state: childStatus.state,
      stuck_count: childStatus.stuck_count ?? 0,
      action: "still_running"
    };
    if (childStatus.state === "exited") {
      const prResult = await createPrForChild(issue, childSession, childDir, state, repo, deps);
      if (prResult.pr_number !== null) {
        const stateIssue = state.issues.find((i) => i.number === issue.number);
        if (stateIssue) {
          stateIssue.state = "pr_open";
          stateIssue.pr_number = prResult.pr_number;
          stateIssue.status = "In review";
          await syncIssueProjectStatus(issue.number, repo, "In review", {
            execGh: deps.execGh,
            appendLog: deps.appendLog,
            now: deps.now,
            sessionDir
          });
        }
        result.prs_created++;
        entry.action = "pr_created";
        entry.pr_number = prResult.pr_number;
        entry.branch = prResult.branch;
        deps.appendLog(sessionDir, {
          timestamp: deps.now().toISOString(),
          event: "child_pr_created",
          issue_number: issue.number,
          child_session: childSession,
          pr_number: prResult.pr_number,
          branch: prResult.branch,
          base_branch: prResult.baseBranch
        });
      } else {
        result.errors++;
        entry.action = "exited_no_pr";
        entry.error = prResult.error ?? "PR creation returned no number";
        deps.appendLog(sessionDir, {
          timestamp: deps.now().toISOString(),
          event: "child_pr_create_failed",
          issue_number: issue.number,
          child_session: childSession,
          error: entry.error
        });
      }
    } else if (childStatus.state === "stopped") {
      const stateIssue = state.issues.find((i) => i.number === issue.number);
      if (stateIssue) {
        stateIssue.state = "failed";
        stateIssue.status = "Blocked";
        await syncIssueProjectStatus(issue.number, repo, "Blocked", {
          execGh: deps.execGh,
          appendLog: deps.appendLog,
          now: deps.now,
          sessionDir
        });
      }
      result.failed++;
      entry.action = "failed";
      deps.appendLog(sessionDir, {
        timestamp: deps.now().toISOString(),
        event: "child_failed",
        issue_number: issue.number,
        child_session: childSession,
        stuck_count: childStatus.stuck_count,
        last_phase: childStatus.phase,
        last_provider: childStatus.provider
      });
    } else {
      result.still_running++;
      entry.action = "still_running";
      if ((childStatus.stuck_count ?? 0) >= 2) {
        deps.appendLog(sessionDir, {
          timestamp: deps.now().toISOString(),
          event: "child_stuck_warning",
          issue_number: issue.number,
          child_session: childSession,
          stuck_count: childStatus.stuck_count,
          phase: childStatus.phase
        });
      }
    }
    result.entries.push(entry);
  }
  return result;
}
function isHousekeepingCommit(commitMessage) {
  const trailerMatch = commitMessage.match(/Aloop-Agent:\s*(\S+)/);
  if (!trailerMatch)
    return false;
  return HOUSEKEEPING_AGENTS.has(trailerMatch[1]);
}
async function detectSpecChanges(state, projectRoot, execGit) {
  const specGlob = state.spec_glob ?? DEFAULT_SPEC_GLOB;
  const specPaths = specGlob.split(/\s+/);
  const headResult = await execGit(["rev-parse", "HEAD"], projectRoot);
  const newCommit = headResult.stdout.trim();
  if (!state.spec_last_commit) {
    return { changed: false, diff: "", new_commit: newCommit, changed_files: [] };
  }
  if (state.spec_last_commit === newCommit) {
    return { changed: false, diff: "", new_commit: newCommit, changed_files: [] };
  }
  const logResult = await execGit(
    ["log", "-1", "--format=%B", state.spec_last_commit + ".." + newCommit, "--", ...specPaths],
    projectRoot
  );
  if (logResult.stdout.trim() && isHousekeepingCommit(logResult.stdout)) {
    return { changed: false, diff: "", new_commit: newCommit, changed_files: [] };
  }
  const diffResult = await execGit(
    ["diff", state.spec_last_commit + ".." + newCommit, "--", ...specPaths],
    projectRoot
  );
  const diff = diffResult.stdout.trim();
  if (!diff) {
    return { changed: false, diff: "", new_commit: newCommit, changed_files: [] };
  }
  const nameResult = await execGit(
    ["diff", "--name-only", state.spec_last_commit + ".." + newCommit, "--", ...specPaths],
    projectRoot
  );
  const changed_files = nameResult.stdout.trim().split("\n").filter((f) => f.length > 0);
  return { changed: true, diff, new_commit: newCommit, changed_files };
}
async function queueReplanForSpecChange(diff, changedFiles, state, queueDir, replanPromptContent, deps) {
  const issueContext = state.issues.map(
    (issue) => `- #${issue.number} [${issue.state}${issue.status ? ` / ${issue.status}` : ""}] ${issue.title} (wave ${issue.wave})`
  ).join("\n");
  const content = [
    "---",
    JSON.stringify(
      { agent: "orch_replan", reasoning: "xhigh", type: "replan", trigger: "spec_change" },
      null,
      2
    ),
    "---",
    "",
    replanPromptContent,
    "",
    "## Trigger Context",
    "",
    `**Trigger**: spec_change`,
    `**Changed files**: ${changedFiles.join(", ")}`,
    "",
    "### Spec Diff",
    "",
    "```diff",
    diff,
    "```",
    "",
    "## Current Orchestrator State",
    "",
    `**Autonomy level**: ${state.autonomy_level ?? "balanced"}`,
    `**Current wave**: ${state.current_wave}`,
    `**Total issues**: ${state.issues.length}`,
    "",
    issueContext,
    "",
    "Write replan actions to `requests/replan-spec-change-results.json`."
  ].join("\n");
  await deps.writeFile(path14.join(queueDir, "replan-spec-change.md"), content, "utf8");
}
function applyReplanActions(state, actions) {
  let applied = 0;
  for (const action of actions) {
    switch (action.action) {
      case "create_issue": {
        if (!action.title)
          continue;
        const maxNumber = state.issues.reduce((max, i) => Math.max(max, i.number), 0);
        const newIssue = {
          number: maxNumber + 1,
          title: action.title,
          body: action.body,
          wave: action.new_wave ?? state.current_wave,
          state: "pending",
          status: "Needs analysis",
          child_session: null,
          pr_number: null,
          depends_on: action.deps ?? []
        };
        state.issues.push(newIssue);
        applied++;
        break;
      }
      case "update_issue": {
        if (action.number == null)
          continue;
        const issue = state.issues.find((i) => i.number === action.number);
        if (!issue)
          continue;
        if (action.new_body)
          issue.body = action.new_body;
        if (action.title)
          issue.title = action.title;
        applied++;
        break;
      }
      case "close_issue": {
        if (action.number == null)
          continue;
        const issue = state.issues.find((i) => i.number === action.number);
        if (!issue)
          continue;
        if (issue.state === "pending") {
          issue.state = "failed";
          issue.status = "Done";
          applied++;
        }
        break;
      }
      case "steer_child": {
        if (action.number == null || !action.instruction)
          continue;
        const issue = state.issues.find((i) => i.number === action.number);
        if (!issue || !issue.child_session)
          continue;
        if (!issue.pending_steering_comments)
          issue.pending_steering_comments = [];
        issue.pending_steering_comments.push({
          id: Date.now(),
          author: "replan-agent",
          body: action.instruction
        });
        applied++;
        break;
      }
      case "reprioritize": {
        if (action.number == null || action.new_wave == null)
          continue;
        const issue = state.issues.find((i) => i.number === action.number);
        if (!issue)
          continue;
        issue.wave = action.new_wave;
        applied++;
        break;
      }
    }
  }
  return applied;
}
async function applySpecBackfill(specFile, section, content, sessionId, iteration, projectRoot, deps) {
  return writeSpecBackfill({ specFile, section, content, sessionId, iteration, projectRoot, deps });
}
async function queueSpecConsistencyCheck(changedFiles, diff, state, queueDir, consistencyPromptContent, deps) {
  const issueContext = state.issues.map((issue) => `- #${issue.number} [${issue.state}] ${issue.title}`).join("\n");
  const content = [
    "---",
    JSON.stringify(
      { agent: "orch_spec_consistency", reasoning: "xhigh", type: "spec_consistency" },
      null,
      2
    ),
    "---",
    "",
    consistencyPromptContent,
    "",
    "## Changed Files",
    "",
    changedFiles.map((f) => `- ${f}`).join("\n"),
    "",
    "## Diff Context",
    "",
    "```diff",
    diff,
    "```",
    "",
    "## Related Issues",
    "",
    issueContext,
    "",
    "Write consistency report to `requests/spec-consistency-results.json`."
  ].join("\n");
  await deps.writeFile(path14.join(queueDir, "spec-consistency-check.md"), content, "utf8");
}
async function processQueuedPrompts(sessionDir, projectRoot, aloopRoot, iteration, deps) {
  const queueDir = path14.join(sessionDir, "queue");
  const result = { processed: 0, files: [] };
  if (!deps.existsSync(queueDir))
    return result;
  let entries;
  if (deps.readdir) {
    entries = await deps.readdir(queueDir);
  } else {
    const knownFiles = [
      "replan-spec-change.md",
      "spec-consistency-check.md",
      "decompose-epics.md",
      "gap-analysis-product.md",
      "gap-analysis-architecture.md"
    ];
    entries = knownFiles.filter((f) => deps.existsSync(path14.join(queueDir, f)));
  }
  const mdFiles = entries.filter((f) => f.endsWith(".md")).sort();
  if (mdFiles.length === 0)
    return result;
  const fileName = mdFiles[0];
  const filePath = path14.join(queueDir, fileName);
  try {
    const content = await deps.readFile(filePath, "utf8");
    if (content.trim().length === 0) {
      if (deps.unlink) {
        await deps.unlink(filePath);
      }
      return result;
    }
    const requestsDir = path14.join(sessionDir, "requests");
    const baseName = fileName.replace(/\.md$/, "");
    const requestFile = path14.join(requestsDir, `${baseName}-pending.json`);
    const request = {
      type: "queued_prompt",
      source_file: fileName,
      queued_at: deps.now().toISOString(),
      iteration,
      prompt_content: content
    };
    await deps.writeFile(requestFile, `${JSON.stringify(request, null, 2)}
`, "utf8");
    if (deps.dispatchDeps && deps.aloopRoot) {
      const loopBinDir = path14.join(deps.aloopRoot, "bin");
      const isWindows = deps.dispatchDeps.platform === "win32";
      const agentPromptsDir = path14.join(sessionDir, "queue-agent-prompts");
      await deps.dispatchDeps.mkdir(agentPromptsDir, { recursive: true });
      const agentPromptFile = path14.join(agentPromptsDir, "PROMPT_queue_agent.md");
      await deps.dispatchDeps.writeFile(agentPromptFile, content, "utf8");
      let command;
      let args;
      if (isWindows) {
        command = "powershell";
        args = [
          "-NoProfile",
          "-File",
          path14.join(loopBinDir, "loop.ps1"),
          "-PromptsDir",
          agentPromptsDir,
          "-SessionDir",
          sessionDir,
          "-WorkDir",
          projectRoot,
          "-Mode",
          "single",
          "-Provider",
          "round-robin",
          "-MaxIterations",
          "1",
          "-MaxStuck",
          "1",
          "-LaunchMode",
          "start"
        ];
      } else {
        command = path14.join(loopBinDir, "loop.sh");
        args = [
          "--prompts-dir",
          agentPromptsDir,
          "--session-dir",
          sessionDir,
          "--work-dir",
          projectRoot,
          "--mode",
          "single",
          "--provider",
          "round-robin",
          "--max-iterations",
          "1",
          "--max-stuck",
          "1",
          "--launch-mode",
          "start"
        ];
      }
      const child = deps.dispatchDeps.spawn(command, args, {
        cwd: projectRoot,
        detached: true,
        stdio: "ignore",
        env: { ...deps.dispatchDeps.env },
        windowsHide: true
      });
      child.unref();
    }
    if (deps.unlink) {
      await deps.unlink(filePath);
    } else {
      await deps.writeFile(filePath, "", "utf8");
    }
    result.processed++;
    result.files.push(fileName);
    deps.appendLog(sessionDir, {
      timestamp: deps.now().toISOString(),
      event: "queue_prompt_processed",
      iteration,
      file: fileName,
      dispatched: !!(deps.dispatchDeps && deps.aloopRoot)
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    deps.appendLog(sessionDir, {
      timestamp: deps.now().toISOString(),
      event: "queue_prompt_error",
      iteration,
      file: fileName,
      error: msg
    });
  }
  return result;
}
async function runSpecChangeReplan(state, stateFile, sessionDir, projectRoot, iteration, deps) {
  const result = {
    spec_changed: false,
    diff_queued: false,
    actions_applied: 0,
    gap_analysis_triggered: false,
    backfill_applied: false
  };
  if (!deps.execGit)
    return result;
  const detection = await detectSpecChanges(state, projectRoot, deps.execGit);
  state.spec_last_commit = detection.new_commit;
  if (!detection.changed)
    return result;
  result.spec_changed = true;
  deps.appendLog(sessionDir, {
    timestamp: deps.now().toISOString(),
    event: "spec_change_detected",
    iteration,
    changed_files: detection.changed_files,
    diff_length: detection.diff.length
  });
  const queueDir = path14.join(sessionDir, "queue");
  const promptsDir = path14.join(sessionDir, "prompts");
  const replanPromptPath = path14.join(promptsDir, ORCH_REPLAN_PROMPT_FILENAME);
  let replanPromptContent = `# Orchestrator Replan Agent

React to spec changes and produce plan adjustments.
`;
  if (deps.existsSync(replanPromptPath)) {
    replanPromptContent = await deps.readFile(replanPromptPath, "utf8");
  }
  await queueReplanForSpecChange(
    detection.diff,
    detection.changed_files,
    state,
    queueDir,
    replanPromptContent,
    { writeFile: deps.writeFile }
  );
  result.diff_queued = true;
  const consistencyPromptPath = path14.join(promptsDir, ORCH_SPEC_CONSISTENCY_PROMPT_FILENAME);
  let consistencyPromptContent = `# Spec Consistency Agent

Verify spec consistency after changes.
`;
  if (deps.existsSync(consistencyPromptPath)) {
    consistencyPromptContent = await deps.readFile(consistencyPromptPath, "utf8");
  }
  await queueSpecConsistencyCheck(
    detection.changed_files,
    detection.diff,
    state,
    queueDir,
    consistencyPromptContent,
    { writeFile: deps.writeFile }
  );
  const replanResultPath = path14.join(sessionDir, "requests", "replan-spec-change-results.json");
  if (deps.existsSync(replanResultPath)) {
    try {
      const replanContent = await deps.readFile(replanResultPath, "utf8");
      const replanResult = JSON.parse(replanContent);
      if (replanResult.actions && Array.isArray(replanResult.actions)) {
        result.actions_applied = applyReplanActions(state, replanResult.actions);
      }
      if (replanResult.gap_analysis_needed) {
        result.gap_analysis_triggered = true;
      }
      deps.appendLog(sessionDir, {
        timestamp: deps.now().toISOString(),
        event: "replan_actions_applied",
        iteration,
        trigger: replanResult.trigger,
        actions_applied: result.actions_applied,
        gap_analysis_needed: replanResult.gap_analysis_needed,
        affected_sections: replanResult.affected_sections
      });
    } catch {
      deps.appendLog(sessionDir, {
        timestamp: deps.now().toISOString(),
        event: "replan_results_parse_error",
        iteration
      });
    }
  }
  const backfillResultPath = path14.join(sessionDir, "requests", "spec-backfill-results.json");
  if (deps.existsSync(backfillResultPath)) {
    try {
      const backfillContent = await deps.readFile(backfillResultPath, "utf8");
      const backfillData = JSON.parse(backfillContent);
      if (backfillData.entries && Array.isArray(backfillData.entries)) {
        for (const entry of backfillData.entries) {
          await applySpecBackfill(
            entry.file || state.spec_file,
            entry.section,
            entry.content,
            path14.basename(sessionDir),
            iteration,
            projectRoot,
            { readFile: deps.readFile, writeFile: deps.writeFile, execGit: deps.execGit }
          );
        }
        result.backfill_applied = true;
      }
    } catch {
      deps.appendLog(sessionDir, {
        timestamp: deps.now().toISOString(),
        event: "spec_backfill_parse_error",
        iteration
      });
    }
  }
  return result;
}
async function fetchAndApplyBulkIssueState(state, repo, deps, sessionDir, iteration) {
  const startTime = Date.now();
  const result = {
    issuesFetched: 0,
    issuesChanged: 0,
    fromCache: false,
    durationMs: 0
  };
  if (!deps.execGh)
    return result;
  try {
    const issueNumbers = state.issues.map((i) => i.number);
    const since = state.issues.reduce((earliest, issue) => {
      const check = issue.last_comment_check;
      if (!check)
        return earliest;
      return !earliest || check < earliest ? check : earliest;
    }, void 0);
    const bulkResult = await fetchBulkIssueState(repo, deps.execGh, {
      states: ["OPEN"],
      since,
      issueNumbers
    });
    result.issuesFetched = bulkResult.issues.length;
    result.fromCache = bulkResult.fromCache;
    const fetchedMap = /* @__PURE__ */ new Map();
    for (const issue of bulkResult.issues) {
      fetchedMap.set(issue.number, issue);
    }
    for (const issue of state.issues) {
      const fetched = fetchedMap.get(issue.number);
      if (!fetched)
        continue;
      const changeResult = detectIssueChanges(fetched, {
        updatedAt: issue.last_comment_check,
        prNumber: issue.pr_number,
        state: issue.state
      });
      if (changeResult.changed) {
        result.issuesChanged++;
        if (fetched.projectStatus) {
          const statusMap = {
            "todo": "Ready",
            "in progress": "In progress",
            "in review": "In review",
            "done": "Done",
            "blocked": "Blocked"
          };
          const mapped = statusMap[fetched.projectStatus.toLowerCase()];
          if (mapped)
            issue.status = mapped;
        }
        if (fetched.pr && !issue.pr_number) {
          issue.pr_number = fetched.pr.number;
        }
        deps.appendLog(sessionDir, {
          timestamp: deps.now().toISOString(),
          event: "bulk_fetch_issue_changed",
          iteration,
          issue_number: issue.number,
          reason: changeResult.reason,
          pr_number: fetched.pr?.number ?? null,
          project_status: fetched.projectStatus
        });
      }
    }
    if (deps.etagCache) {
      await deps.etagCache.save();
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    deps.appendLog(sessionDir, {
      timestamp: deps.now().toISOString(),
      event: "bulk_fetch_error",
      iteration,
      error: msg
    });
  }
  result.durationMs = Date.now() - startTime;
  return result;
}
async function runOrchestratorScanPass(stateFile, sessionDir, projectRoot, projectName, promptsSourceDir, aloopRoot, repo, iteration, deps) {
  const stateContent = await deps.readFile(stateFile, "utf8");
  const state = JSON.parse(stateContent);
  const result = {
    iteration,
    triage: { processed_issues: 0, triaged_entries: 0 },
    specQuestions: { processed: 0, waiting: 0, autoResolved: 0, userOverrides: 0 },
    dispatched: 0,
    queueProcessed: 0,
    childMonitoring: null,
    prLifecycles: [],
    waveAdvanced: false,
    budgetExceeded: false,
    allDone: false,
    shouldStop: false,
    replan: null,
    bulkFetch: null
  };
  if (deps.execGit) {
    result.replan = await runSpecChangeReplan(
      state,
      stateFile,
      sessionDir,
      projectRoot,
      iteration,
      deps
    );
  }
  if (repo && deps.execGh && state.issues.length > 0) {
    result.bulkFetch = await fetchAndApplyBulkIssueState(
      state,
      repo,
      { execGh: deps.execGh, etagCache: deps.etagCache, appendLog: deps.appendLog, now: deps.now },
      sessionDir,
      iteration
    );
  }
  const queueResult = await processQueuedPrompts(
    sessionDir,
    projectRoot,
    aloopRoot,
    iteration,
    deps
  );
  result.queueProcessed = queueResult.processed;
  if (repo && deps.execGh) {
    result.triage = await runTriageMonitorCycle(
      state,
      path14.basename(sessionDir),
      repo,
      { execGh: deps.execGh, now: deps.now, writeFile: deps.writeFile },
      aloopRoot
    );
    result.specQuestions = await resolveSpecQuestionIssues(
      state,
      repo,
      sessionDir,
      { execGh: deps.execGh, appendLog: deps.appendLog, now: deps.now }
    );
  }
  if (deps.dispatchDeps && !state.plan_only) {
    const dispatchable = getDispatchableIssues(state);
    const capabilityResult = filterByHostCapabilities(dispatchable, deps.dispatchDeps);
    const eligible = filterByFileOwnership(capabilityResult.eligible, state);
    const slots = availableSlots(state);
    const toDispatch = eligible.slice(0, slots);
    for (const blocked of capabilityResult.blocked) {
      deps.appendLog(sessionDir, {
        timestamp: deps.now().toISOString(),
        event: "scan_dispatch_blocked_requirements",
        iteration,
        issue_number: blocked.issue.number,
        requires: normalizeTaskRequires(blocked.issue.requires),
        missing: blocked.missing
      });
    }
    for (const issue of toDispatch) {
      try {
        const launchResult = await launchChildLoop(
          issue,
          sessionDir,
          projectRoot,
          projectName,
          promptsSourceDir,
          aloopRoot,
          deps.dispatchDeps
        );
        const stateIssue = state.issues.find((i) => i.number === issue.number);
        if (stateIssue) {
          stateIssue.state = "in_progress";
          stateIssue.child_session = launchResult.session_id;
          stateIssue.status = "In progress";
          if (repo && deps.execGh) {
            await syncIssueProjectStatus(issue.number, repo, "In progress", {
              execGh: deps.execGh,
              appendLog: deps.appendLog,
              now: deps.now,
              sessionDir
            });
          }
        }
        result.dispatched++;
        deps.appendLog(sessionDir, {
          timestamp: deps.now().toISOString(),
          event: "scan_child_dispatched",
          iteration,
          issue_number: issue.number,
          session_id: launchResult.session_id
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        deps.appendLog(sessionDir, {
          timestamp: deps.now().toISOString(),
          event: "scan_dispatch_error",
          iteration,
          issue_number: issue.number,
          error: msg
        });
      }
    }
  }
  if (repo && deps.execGh && deps.aloopRoot) {
    try {
      result.childMonitoring = await monitorChildSessions(
        state,
        sessionDir,
        repo,
        {
          existsSync: deps.existsSync,
          readFile: deps.readFile,
          writeFile: deps.writeFile,
          execGh: deps.execGh,
          now: deps.now,
          appendLog: deps.appendLog,
          aloopRoot: deps.aloopRoot
        }
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      deps.appendLog(sessionDir, {
        timestamp: deps.now().toISOString(),
        event: "scan_monitor_error",
        iteration,
        error: msg
      });
    }
  }
  if (repo && deps.prLifecycleDeps) {
    const prIssues = state.issues.filter((i) => i.pr_number !== null && i.state === "pr_open");
    for (const issue of prIssues) {
      try {
        const lifecycleResult = await processPrLifecycle(
          issue,
          state,
          stateFile,
          sessionDir,
          repo,
          deps.prLifecycleDeps
        );
        result.prLifecycles.push(lifecycleResult);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        deps.appendLog(sessionDir, {
          timestamp: deps.now().toISOString(),
          event: "scan_pr_lifecycle_error",
          iteration,
          issue_number: issue.number,
          pr_number: issue.pr_number,
          error: msg
        });
      }
    }
  }
  const waveAdvanced = advanceWave(state);
  result.waveAdvanced = waveAdvanced;
  if (waveAdvanced) {
    deps.appendLog(sessionDir, {
      timestamp: deps.now().toISOString(),
      event: "scan_wave_advanced",
      iteration,
      new_wave: state.current_wave,
      completed_waves: state.completed_waves
    });
  }
  if (state.budget_cap !== null) {
    try {
      const budget = await aggregateChildCosts(state, aloopRoot, {
        readFile: deps.readFile,
        existsSync: deps.existsSync
      });
      if (shouldPauseForBudget(budget)) {
        result.budgetExceeded = true;
        deps.appendLog(sessionDir, {
          timestamp: deps.now().toISOString(),
          event: "scan_budget_exceeded",
          iteration,
          total_cost: budget.total_estimated_cost_usd,
          budget_cap: budget.budget_cap
        });
      }
    } catch {
    }
  }
  const allMerged = state.issues.length > 0 && state.issues.every((i) => i.state === "merged" || i.state === "failed");
  result.allDone = allMerged;
  if (deps.signalStop?.()) {
    result.shouldStop = true;
  }
  state.updated_at = deps.now().toISOString();
  await deps.writeFile(stateFile, `${JSON.stringify(state, null, 2)}
`, "utf8");
  deps.appendLog(sessionDir, {
    timestamp: deps.now().toISOString(),
    event: "scan_pass_complete",
    iteration,
    dispatched: result.dispatched,
    queue_processed: result.queueProcessed,
    monitored: result.childMonitoring?.monitored ?? 0,
    prs_created: result.childMonitoring?.prs_created ?? 0,
    child_failed: result.childMonitoring?.failed ?? 0,
    pr_lifecycles: result.prLifecycles.length,
    triage_entries: result.triage.triaged_entries,
    spec_questions_processed: result.specQuestions.processed,
    spec_questions_waiting: result.specQuestions.waiting,
    spec_questions_auto_resolved: result.specQuestions.autoResolved,
    spec_questions_user_overrides: result.specQuestions.userOverrides,
    all_done: result.allDone,
    replan_spec_changed: result.replan?.spec_changed ?? false,
    replan_actions_applied: result.replan?.actions_applied ?? 0,
    bulk_fetch_issues: result.bulkFetch?.issuesFetched ?? 0,
    bulk_fetch_changed: result.bulkFetch?.issuesChanged ?? 0,
    bulk_fetch_cached: result.bulkFetch?.fromCache ?? false,
    bulk_fetch_duration_ms: result.bulkFetch?.durationMs ?? 0
  });
  return result;
}
async function runOrchestratorScanLoop(stateFile, sessionDir, projectRoot, projectName, promptsSourceDir, aloopRoot, repo, intervalMs, maxIterations, deps) {
  const stateContent = await deps.readFile(stateFile, "utf8");
  const initialState = JSON.parse(stateContent);
  if (initialState.plan_only) {
    return {
      iterations: 0,
      finalState: initialState,
      reason: "plan_only"
    };
  }
  for (let iter = 1; iter <= maxIterations; iter++) {
    const passResult = await runOrchestratorScanPass(
      stateFile,
      sessionDir,
      projectRoot,
      projectName,
      promptsSourceDir,
      aloopRoot,
      repo,
      iter,
      deps
    );
    if (passResult.allDone) {
      const currentState = JSON.parse(await deps.readFile(stateFile, "utf8"));
      if (currentState.auto_merge_to_main && repo && deps.execGh) {
        const prNum = await createTrunkToMainPr(currentState, repo, deps, sessionDir);
        if (prNum !== null) {
          currentState.trunk_pr_number = prNum;
          currentState.updated_at = deps.now().toISOString();
          await deps.writeFile(stateFile, `${JSON.stringify(currentState, null, 2)}
`, "utf8");
        }
      }
      deps.appendLog(sessionDir, {
        timestamp: deps.now().toISOString(),
        event: "scan_loop_complete",
        reason: "all_done",
        iterations: iter,
        trunk_pr_number: currentState.trunk_pr_number ?? null
      });
      const finalContent2 = await deps.readFile(stateFile, "utf8");
      return { iterations: iter, finalState: JSON.parse(finalContent2), reason: "all_done" };
    }
    if (passResult.budgetExceeded) {
      deps.appendLog(sessionDir, {
        timestamp: deps.now().toISOString(),
        event: "scan_loop_complete",
        reason: "budget_exceeded",
        iterations: iter
      });
      const finalContent2 = await deps.readFile(stateFile, "utf8");
      return { iterations: iter, finalState: JSON.parse(finalContent2), reason: "budget_exceeded" };
    }
    if (passResult.shouldStop) {
      deps.appendLog(sessionDir, {
        timestamp: deps.now().toISOString(),
        event: "scan_loop_complete",
        reason: "stopped",
        iterations: iter
      });
      const finalContent2 = await deps.readFile(stateFile, "utf8");
      return { iterations: iter, finalState: JSON.parse(finalContent2), reason: "stopped" };
    }
    if (iter < maxIterations && deps.sleep) {
      await deps.sleep(intervalMs);
    }
  }
  if (deps.etagCache) {
    await deps.etagCache.save();
  }
  deps.appendLog(sessionDir, {
    timestamp: deps.now().toISOString(),
    event: "scan_loop_complete",
    reason: "max_iterations",
    iterations: maxIterations
  });
  const finalContent = await deps.readFile(stateFile, "utf8");
  return { iterations: maxIterations, finalState: JSON.parse(finalContent), reason: "max_iterations" };
}
function parseInterval(value) {
  if (!value)
    return 3e4;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1e3) {
    throw new Error(`Invalid interval value: ${value} (must be >= 1000ms)`);
  }
  return parsed;
}
function parseMaxIterations(value) {
  if (!value)
    return 100;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`Invalid max-iterations value: ${value} (must be a positive integer)`);
  }
  return parsed;
}

// src/commands/steer.ts
import { writeFile as writeFile11 } from "node:fs/promises";
import { existsSync as existsSync12 } from "node:fs";
import path15 from "node:path";
function buildSteeringDocument2(instruction, affectsCompletedWork, commit) {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  return [
    "# Steering Instruction",
    "",
    `**Commit:** ${commit}`,
    `**Timestamp:** ${timestamp}`,
    `**Affects completed work:** ${affectsCompletedWork}`,
    "",
    "## Instruction",
    "",
    instruction,
    ""
  ].join("\n");
}
function fail(outputMode, msg) {
  if (outputMode === "json") {
    console.log(JSON.stringify({ success: false, error: msg }));
  } else {
    console.error(msg);
  }
  return process.exit(1);
}
async function steerCommand(instruction, options = {}) {
  const outputMode = options.output || "text";
  const homeDir = resolveHomeDir2(options.homeDir);
  const active = await readActiveSessions2(homeDir);
  const sessionIds = Object.keys(active);
  let sessionId;
  if (options.session) {
    if (!active[options.session]) {
      return fail(outputMode, `Session not found: ${options.session}`);
    }
    sessionId = options.session;
  } else if (sessionIds.length === 1) {
    sessionId = sessionIds[0];
  } else if (sessionIds.length === 0) {
    return fail(outputMode, "No active sessions. Start a session first with `aloop start`.");
  } else {
    return fail(outputMode, `Multiple active sessions. Specify one with --session: ${sessionIds.join(", ")}`);
  }
  const entry = active[sessionId];
  const sessionDir = entry.session_dir ?? path15.join(homeDir, ".aloop", "sessions", sessionId);
  const workdir = entry.work_dir ?? path15.join(sessionDir, "worktree");
  const steeringPath = path15.join(workdir, "STEERING.md");
  if (existsSync12(steeringPath) && !options.overwrite) {
    return fail(outputMode, "A steering instruction is already queued. Use --overwrite to replace it.");
  }
  const affectsCompletedWork = options.affectsCompletedWork ?? "unknown";
  const steeringDoc = buildSteeringDocument2(instruction.trim(), affectsCompletedWork, "cli");
  await writeFile11(steeringPath, steeringDoc, "utf8");
  const promptsDir = path15.join(sessionDir, "prompts");
  const queuePath = await queueSteeringPrompt(
    sessionDir,
    promptsDir,
    steeringDoc
  );
  if (outputMode === "json") {
    console.log(JSON.stringify({ success: true, session: sessionId, queued: true, path: queuePath, steeringPath }));
  } else {
    console.log(`Steering instruction queued for session ${sessionId}.`);
  }
}

// src/index.ts
var program2 = new Command();
program2.name("aloop").description("Aloop CLI for dashboard and project orchestration").version("1.0.0");
program2.command("resolve").description("Resolve project workspace and configuration").option("--project-root <path>", "Project root override").option("--output <mode>", "Output format: json or text", "json").action(withErrorHandling(resolveCommand));
program2.command("discover").description("Discover workspace specs, files, and validation commands").option("--project-root <path>", "Project root override").option("--output <mode>", "Output format: json or text", "json").action(withErrorHandling(discoverCommand));
program2.command("setup").description("Interactive setup and scaffold for aloop project").option("--project-root <path>", "Project root override").option("--home-dir <path>", "Home directory override").option("--spec <path>", "Specification file to use").option("--providers <providers>", "Comma-separated list of providers to enable").option("--mode <mode>", "Setup mode: loop or orchestrate").option("--autonomy-level <level>", "Autonomy level: cautious, balanced, or autonomous").option("--non-interactive", "Skip interactive prompts and use defaults").action(withErrorHandling(setupCommand));
program2.command("scaffold").description("Scaffold project workdir and prompts").option("--project-root <path>", "Project root override").option("--language <language>", "Language override").option("--provider <provider>", "Provider override").option("--enabled-providers <providers...>", "Enabled providers list or csv values").option("--autonomy-level <level>", "Autonomy level: cautious, balanced, or autonomous").option("--round-robin-order <providers...>", "Round-robin provider order list or csv values").option("--spec-files <files...>", "Spec file list or csv values").option("--reference-files <files...>", "Reference file list or csv values").option("--validation-commands <commands...>", "Validation command list or csv values").option("--safety-rules <rules...>", "Safety rule list or csv values").option("--mode <mode>", "Loop mode", "plan-build-review").option("--templates-dir <path>", "Template directory override").option("--output <mode>", "Output format: json or text", "json").action(withErrorHandling(scaffoldCommand));
program2.command("start").description("Start an aloop session for the current project").argument("[session-id]", "Session ID to resume (used with --launch resume)").option("--project-root <path>", "Project root override").option("--home-dir <path>", "Home directory override").option("--provider <provider>", "Provider override").option("--mode <mode>", "Loop mode override").option("--launch <mode>", "Session launch mode: start, restart, or resume").option("--plan", "Shortcut for --mode plan").option("--build", "Shortcut for --mode build").option("--review", "Shortcut for --mode review").option("--in-place", "Run in project root instead of creating a git worktree").option("--max-iterations <number>", "Max iteration override").option("--output <mode>", "Output format: json or text", "text").action(withErrorHandling(startCommand));
program2.command("dashboard").description("Launch real-time progress dashboard").option("-p, --port <number>", "Port to run the dashboard on", "3000").option("--session-dir <path>", "Session directory containing status.json and log.jsonl").option("--workdir <path>", "Project work directory containing TODO.md and related docs").option("--assets-dir <path>", "Directory containing bundled dashboard frontend assets").action(withErrorHandling(dashboardCommand));
program2.command("status").description("Show all active sessions and provider health").option("--home-dir <path>", "Home directory override").option("--output <mode>", "Output format: json or text", "text").option("--watch", "Auto-refresh status display").action(withErrorHandling(statusCommand));
program2.command("active").description("List active sessions").option("--home-dir <path>", "Home directory override").option("--output <mode>", "Output format: json or text", "text").action(withErrorHandling(activeCommand));
program2.command("stop <session-id>").description("Stop a session by session-id").option("--home-dir <path>", "Home directory override").option("--output <mode>", "Output format: json or text", "text").action(withErrorHandling(stopCommand));
program2.command("update").description("Refresh ~/.aloop runtime assets from the current repo checkout").option("--repo-root <path>", "Path to aloop source repository root").option("--home-dir <path>", "Home directory override").option("--output <mode>", "Output format: json or text", "text").action(withErrorHandling(updateCommand));
program2.command("devcontainer").description("Generate or augment .devcontainer/devcontainer.json for isolated agent execution").option("--project-root <path>", "Project root override").option("--home-dir <path>", "Home directory override").option("--output <mode>", "Output format: json or text", "text").action(withErrorHandling(devcontainerCommand));
program2.command("devcontainer-verify").description("Verify devcontainer builds, starts, and passes all checks").option("--project-root <path>", "Project root override").option("--home-dir <path>", "Home directory override").option("--output <mode>", "Output format: json or text", "text").action(withErrorHandling(verifyDevcontainerCommand));
program2.command("orchestrate").description("Decompose spec into issues, dispatch child loops, and merge PRs").option("--spec <paths>", 'Spec file(s) or glob pattern (e.g. "SPEC.md specs/*.md")', "SPEC.md").option("--concurrency <number>", "Max concurrent child loops", "3").option("--trunk <branch>", "Target branch for merged PRs", "agent/trunk").option("--issues <numbers>", "Comma-separated issue numbers to process").option("--label <label>", "GitHub label to filter issues").option("--repo <owner/repo>", "GitHub repository").option("--autonomy-level <level>", "Autonomy level: cautious, balanced, or autonomous").option("--plan <file>", "Decomposition plan JSON file with issues and dependencies").option("--plan-only", "Create issues without launching loops").option("--budget <usd>", "Session budget cap in USD (pauses dispatch at 80%)").option("--interval <ms>", "Scan loop interval in milliseconds (default: 30000)").option("--max-iterations <n>", "Max scan loop iterations (default: 100)").option("--auto-merge", "Create a PR from trunk to main when all issues complete").option("--run-scan-loop", "Run the orchestrator scan loop after initialization").option("--home-dir <path>", "Home directory override").option("--project-root <path>", "Project root override").option("--output <mode>", "Output format: json or text", "text").action(withErrorHandling(orchestrateCommand));
program2.command("steer <instruction>").description("Send a steering instruction to an active session").option("--session <id>", "Target session ID (auto-detected if only one active)").option("--affects-completed-work <value>", "Whether instruction affects completed work: yes, no, or unknown", "unknown").option("--overwrite", "Overwrite an existing queued steering instruction").option("--home-dir <path>", "Home directory override").option("--output <mode>", "Output format: json or text", "text").action(withErrorHandling(steerCommand));
program2.addCommand(ghCommand);
program2.command("debug-env", { hidden: true }).description("Print current environment variables (for testing)").action(withErrorHandling(() => {
  console.log(JSON.stringify(process.env));
}));
process.on("unhandledRejection", (reason) => {
  if (reason instanceof Error) {
    console.error(`Error: ${reason.message}`);
  } else {
    console.error(`Error: ${String(reason)}`);
  }
  process.exit(1);
});
await program2.parseAsync();
