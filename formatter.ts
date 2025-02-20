
const Reset = "\x1b[0m"
const Dim = "\x1b[2m"
const FgRed = "\x1b[31m"
const FgYellow = "\x1b[33m"
const FgWhite = "\x1b[37m"
const BgGreen = "\x1b[42m"

export function cliRedify(content: string) {
  return FgRed + content + Reset
}

export function cliYellowfy(content: string) {
  return FgYellow + content + Reset
}

export function log_red(content: any) {
  console.log(cliRedify(content))
}

export function log_yellow(content: any) {
  console.log(cliYellowfy(content))
}

export function log_dim(content: string) {
  console.log(Dim + content + Reset)
}