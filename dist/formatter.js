"use strict";
const Reset = "\x1b[0m";
const Dim = "\x1b[2m";
const FgRed = "\x1b[31m";
const FgYellow = "\x1b[33m";
const FgWhite = "\x1b[37m";
const BgGreen = "\x1b[42m";
function cliRedify(content) {
    return FgRed + content + Reset;
}
function cliYellowfy(content) {
    return FgYellow + content + Reset;
}
function log_red(content) {
    console.log(cliRedify(content));
}
function log_yellow(content) {
    console.log(cliYellowfy(content));
}
function log_dim(content) {
    console.log(Dim + content + Reset);
}
