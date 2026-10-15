import getpass
import os
import sys
import time

VERSION = "0.1.0"

RESET = "\x1b[0m"
BOLD = "\x1b[1m"
GREY = "\x1b[38;5;240m"
FG = "\x1b[38;5;252m"
ACCENT = "\x1b[38;5;36m"
ALERT = "\x1b[38;5;173m"

LOGO = """⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠹⣪⢯⣪⡫⣎⢯⢪⡫⡎⡯⣪⡫⣎⣏⡷⣽⠝⠁
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠁⠉⠘⣗⢧⢳⢕⡝⡮⣺⣞⠏⠈⠉⠁
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⡴⣶⢿⣪⢗⡝⡮⣪⡳⢽⣺⣿⢿⣟⣿⣳⢶⡲⡤⣄⣀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣴⢾⣻⣟⣿⠿⣺⢕⢗⢽⢜⢮⣫⢷⠿⣿⣽⢾⣳⢯⡯⡯⣞⣮⡳⠃
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⣺⣟⡿⣽⢯⡇⠀⣗⢯⡫⡮⣳⢝⣞⣯⠀⠀⠀⠉⠉⠋⠯⢟⡷⠃
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡾⢵⣳⣟⣽⢽⡯⣦⣝⡵⣝⢮⡳⣝⣞⡷
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢹⣧⡳⣗⣯⢿⣽⣻⡾⡯⡮⣳⡫⣗⣗⡿⣄⣀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠙⠻⣾⣼⣛⡾⣯⣿⡯⡯⣺⣝⣞⣞⣟⣿⣻⣽⣳⢦⢤⣀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠛⠻⠷⣷⡯⡯⣞⣞⣞⢾⡽⣿⣯⣷⢯⣯⢷⢽⣝⢶⢄
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣖⡮⡯⣞⣞⡮⡿⣽⢷⣯⣾⣻⡽⣯⢿⣺⡯⣟⣧⡀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣗⡯⡯⣞⣞⢾⢽⡿⠀⠀⠉⠻⢽⣷⣯⣻⣽⣿⣽⣧
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣴⢦⣄⡀⠀⠀⠀⠀⣗⣯⣻⣺⣺⢽⣫⣿⠀⠀⠀⠀⠀⢻⣽⣿⣞⣷⣿⣽⠄
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣴⢿⡾⣯⡷⣟⣿⣲⣦⣤⣗⣗⣗⢷⢽⡽⣽⣾⠀⠀⠀⠀⠀⣸⣿⣯⣿⣾⣯⡿
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠺⠯⣿⣻⣽⣯⡿⣯⣿⣽⣷⣿⣺⡵⡯⡯⣯⢯⡷⣿⣤⣤⣤⣴⣞⣿⡾⣿⢾⣯⡿⠁
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠙⠚⠻⠟⢷⣿⣷⣿⣳⢯⢯⢿⣝⣯⣟⣿⣾⢿⣽⣾⣟⣷⢿⠻⠛⠁
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣨⣳⣻⣽⣻⣞⡷⣯⡷⣍⠉⠉⠈⠁
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⣲⡽⣞⡾⣾⣺⣗⣯⣟⡷⣟⣯⣿⣲⣄
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠚⠓⠋⠛⠙⠋⠓⠛⠚⠓⠛⠙⠛⠓⠋⠓⠛⠓"""

MENU = [
    ("01", "domain recon", "whois, dns records, zone transfer"),
    ("02", "subdomain enum", "bruteforce, ct logs, passive dns"),
    ("03", "ip lookup", "geoip, asn, reverse dns, ptr"),
    ("04", "port sweep", "tcp connect, banner grab"),
    ("05", "web fingerprint", "headers, tech stack, robots, wayback"),
    ("06", "email intel", "syntax, mx, smtp probe, breach check"),
    ("07", "username sweep", "profile hunt across platforms"),
    ("08", "phone lookup", "carrier, region, line type"),
    ("09", "metadata", "exif, pdf and office properties"),
    ("10", "hash toolkit", "identify, crack lists, compare"),
    ("11", "report", "export findings as json / md / html"),
    ("12", "config", "proxy, timeouts, api keys"),
]

FOOTER = [
    ("t", "set target"),
    ("r", "redraw"),
    ("0", "exit"),
]


def enable_ansi():
    if os.environ.get("NO_COLOR"):
        return False
    if os.name == "nt":
        try:
            import colorama

            colorama.just_fix_windows_console()
        except Exception:
            try:
                os.system("")
            except Exception:
                return False
    return True


class OpenEyes:
    def __init__(self):
        self.color = enable_ansi()
        self.user = self.whoami()
        self.target = None
        self.findings = 0
        self.running = True
        self.notice = None

    def whoami(self):
        try:
            name = getpass.getuser()
        except Exception:
            name = os.environ.get("USERNAME") or "operator"
        return (name or "operator").lower()

    def c(self, code, text):
        return f"{code}{text}{RESET}" if self.color else text

    def out(self, text=""):
        sys.stdout.write(text + "\n")
        sys.stdout.flush()

    def clear(self):
        sys.stdout.write("\x1b[2J\x1b[H")
        sys.stdout.flush()

    def rule(self, label=""):
        width = 64
        if not label:
            return self.c(GREY, "  " + "─" * width)
        head = f"── {label} "
        return self.c(GREY, "  " + head + "─" * max(0, width - len(head)))

    def splash(self):
        self.clear()
        for line in LOGO.splitlines():
            self.out("   " + self.c(ACCENT, line))
            time.sleep(0.02)
        self.out()
        self.out("   " + self.c(BOLD, "openeyes"))
        self.out()
        time.sleep(0.2)

    def draw(self):
        self.clear()
        self.out()
        self.out("   " + self.c(BOLD, "openeyes"))
        self.out()
        self.out(self.rule("modules"))
        self.out()
        for key, name, desc in MENU:
            self.out(
                "    "
                + self.c(ACCENT, key)
                + self.c(GREY, " │ ")
                + self.c(FG, f"{name:<17}")
                + self.c(GREY, desc)
            )
        self.out()
        self.out(self.rule())
        line = "    " + self.c(GREY, "target ") + self.c(
            FG if self.target else GREY, self.target or "none"
        )
        line += self.c(GREY, "    findings ") + self.c(FG, str(self.findings))
        self.out(line)
        keys = self.c(GREY, "   ").join(
            self.c(ACCENT, k) + self.c(GREY, " " + label) for k, label in FOOTER
        )
        self.out("    " + keys)
        self.out()
        if self.notice:
            self.out("    " + self.notice)
            self.out()
            self.notice = None

    def prompt(self):
        user = self.c(ACCENT, self.user)
        host = self.c(ACCENT, "openeyes")
        path = self.c(FG, "~")
        return (
            f"   {user}{self.c(GREY, '@')}{host}{self.c(GREY, ':')}{path}"
            f"{self.c(BOLD, '#')} "
        )

    def ask(self, label):
        try:
            return input("   " + self.c(GREY, label + " ")).strip()
        except (EOFError, KeyboardInterrupt):
            self.out()
            return ""

    def open_module(self, key):
        _, name, desc = next(m for m in MENU if m[0] == key)
        self.clear()
        self.out()
        self.out(self.rule(name))
        self.out()
        self.out("    " + self.c(GREY, desc))
        self.out()
        self.out(
            "    "
            + self.c(GREY, "target   ")
            + self.c(FG if self.target else GREY, self.target or "not set")
        )
        self.out("    " + self.c(ALERT, "module not implemented yet"))
        self.out()
        self.out(self.rule())
        try:
            input("   " + self.c(GREY, "enter to return "))
        except (EOFError, KeyboardInterrupt):
            self.running = False

    def set_target(self):
        value = self.ask("target >")
        if value:
            self.target = value
            self.notice = self.c(GREY, f"target set to {value}")
        else:
            self.notice = self.c(GREY, "target unchanged")

    def handle(self, choice):
        if choice in ("0", "q", "exit", "quit"):
            self.running = False
            return
        if choice in ("r", ""):
            return
        if choice == "t":
            self.set_target()
            return
        keys = [m[0] for m in MENU]
        if choice.zfill(2) in keys:
            self.open_module(choice.zfill(2))
            return
        self.notice = self.c(ALERT, f"invalid selection: {choice}")

    def run(self):
        self.splash()
        while self.running:
            self.draw()
            try:
                choice = input(self.prompt())
            except EOFError:
                self.out()
                break
            except KeyboardInterrupt:
                self.out()
                self.running = False
                break
            self.handle(choice.strip().lstrip("﻿").lower())
        self.out()
        self.out("   " + self.c(GREY, "session closed"))


def main():
    OpenEyes().run()


if __name__ == "__main__":
    main()
