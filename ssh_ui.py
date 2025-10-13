"""SSH command execution UI with per-host progress tracking.

This script provides a Tkinter-based user interface to run a command on
multiple SSH servers using shared credentials. Results are saved into an
Excel workbook, and progress for each host is visualized individually as
well as overall.
"""

from __future__ import annotations

import datetime
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List

import paramiko
from openpyxl import Workbook
from tkinter import END, BOTH, LEFT, RIGHT, StringVar, Tk, messagebox
from tkinter import ttk
from tkinter.scrolledtext import ScrolledText


@dataclass
class ServerRow:
    """Represents the UI components for a single server's progress."""

    frame: ttk.Frame
    name_label: ttk.Label
    progress_bar: ttk.Progressbar
    status_label: ttk.Label
    detail_label: ttk.Label

    def update(self, progress: int, status: str, detail: str = "") -> None:
        """Update the row with new progress and status information."""
        self.progress_bar["value"] = progress
        self.status_label.configure(text=status)
        self.detail_label.configure(text=detail)


class SSHUpdateManager:
    """Main controller for the Tkinter user interface."""

    def __init__(self, root: Tk) -> None:
        self.root = root
        self.root.title("SSH Command Manager")
        self.root.geometry("820x640")

        self.username_var = StringVar()
        self.password_var = StringVar()
        self.command_var = StringVar(value="sudo yum update -y")

        self.server_rows: Dict[str, ServerRow] = {}
        self.current_thread: threading.Thread | None = None

        self._build_ui()

    def _build_ui(self) -> None:
        """Construct all Tkinter widgets."""
        credentials_frame = ttk.LabelFrame(self.root, text="Credentials")
        credentials_frame.pack(fill=BOTH, padx=10, pady=10)

        ttk.Label(credentials_frame, text="Username:").grid(row=0, column=0, sticky="w", padx=5, pady=5)
        ttk.Entry(credentials_frame, textvariable=self.username_var, width=30).grid(row=0, column=1, sticky="we", padx=5, pady=5)

        ttk.Label(credentials_frame, text="Password:").grid(row=1, column=0, sticky="w", padx=5, pady=5)
        ttk.Entry(credentials_frame, textvariable=self.password_var, width=30, show="*").grid(row=1, column=1, sticky="we", padx=5, pady=5)

        credentials_frame.columnconfigure(1, weight=1)

        command_frame = ttk.LabelFrame(self.root, text="Command")
        command_frame.pack(fill=BOTH, padx=10, pady=5)

        ttk.Entry(command_frame, textvariable=self.command_var).pack(fill=BOTH, padx=5, pady=5)

        server_frame = ttk.LabelFrame(self.root, text="Server IPs / Hostnames (one per line)")
        server_frame.pack(fill=BOTH, expand=True, padx=10, pady=5)

        self.server_text = ScrolledText(server_frame, height=8)
        self.server_text.pack(fill=BOTH, expand=True, padx=5, pady=5)

        controls_frame = ttk.Frame(self.root)
        controls_frame.pack(fill=BOTH, padx=10, pady=5)

        self.run_button = ttk.Button(controls_frame, text="Run Command", command=self.run_command)
        self.run_button.pack(side=LEFT, padx=5)

        self.overall_progress = ttk.Progressbar(controls_frame, length=400, mode="determinate")
        self.overall_progress.pack(side=LEFT, padx=10, fill=BOTH, expand=True)

        self.status_message = ttk.Label(controls_frame, text="Idle")
        self.status_message.pack(side=RIGHT, padx=5)

        self.results_frame = ttk.LabelFrame(self.root, text="Per-server progress")
        self.results_frame.pack(fill=BOTH, expand=True, padx=10, pady=10)

        self.log_output = ScrolledText(self.root, height=8, state="disabled")
        self.log_output.pack(fill=BOTH, expand=True, padx=10, pady=(0, 10))

    def log(self, message: str) -> None:
        """Append a message to the log output box."""
        self.log_output.configure(state="normal")
        self.log_output.insert(END, message + "\n")
        self.log_output.configure(state="disabled")
        self.log_output.see(END)

    def run_command(self) -> None:
        """Validate input and start command execution in a thread."""
        if self.current_thread and self.current_thread.is_alive():
            messagebox.showinfo("In Progress", "A command execution is already in progress.")
            return

        username = self.username_var.get().strip()
        password = self.password_var.get()
        command = self.command_var.get().strip()
        servers = [line.strip() for line in self.server_text.get("1.0", END).splitlines() if line.strip()]

        if not username or not password or not command or not servers:
            messagebox.showerror("Missing Information", "Please provide username, password, command, and at least one server.")
            return

        self.log("Starting command execution...")
        self.status_message.configure(text="Running")
        self.run_button.configure(state="disabled")
        self._prepare_server_rows(servers)

        self.current_thread = threading.Thread(
            target=self._execute_commands,
            args=(servers, username, password, command),
            daemon=True,
        )
        self.current_thread.start()

    def _prepare_server_rows(self, servers: List[str]) -> None:
        """Reset UI elements for the new run."""
        for child in self.results_frame.winfo_children():
            child.destroy()
        self.server_rows.clear()

        for host in servers:
            row_frame = ttk.Frame(self.results_frame)
            row_frame.pack(fill=BOTH, padx=5, pady=3)

            name_label = ttk.Label(row_frame, text=host, width=18)
            name_label.pack(side=LEFT, padx=5)

            progress_bar = ttk.Progressbar(row_frame, maximum=100, length=220)
            progress_bar.pack(side=LEFT, padx=5)

            status_label = ttk.Label(row_frame, text="Pending", width=20)
            status_label.pack(side=LEFT, padx=5)

            detail_label = ttk.Label(row_frame, text="", width=40)
            detail_label.pack(side=LEFT, padx=5)

            self.server_rows[host] = ServerRow(
                frame=row_frame,
                name_label=name_label,
                progress_bar=progress_bar,
                status_label=status_label,
                detail_label=detail_label,
            )

        self.overall_progress["value"] = 0
        self.overall_progress["maximum"] = len(servers)

    def _execute_commands(self, servers: List[str], username: str, password: str, command: str) -> None:
        """Execute SSH command sequentially and record results."""
        wb = Workbook()
        ws = wb.active
        ws.title = "Update Results"
        ws.append(["Server", "Result", "Error"])

        for index, host in enumerate(servers, start=1):
            self._update_server_row(host, 5, "Connecting...", "")
            self.log(f"Connecting to {host}...")
            try:
                client = paramiko.SSHClient()
                client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
                client.connect(hostname=host, username=username, password=password)

                self._update_server_row(host, 35, "Executing command", "")
                self.log(f"Running command on {host}...")

                stdin, stdout, stderr = client.exec_command(command, get_pty=True)
                if "sudo" in command:
                    stdin.write(password + "\n")
                    stdin.flush()

                output = stdout.read().decode()
                error = stderr.read().decode()

                if "Nothing to do." in output:
                    result_text = "Nothing to do (Already updated)"
                    error_text = "No Error"
                elif output:
                    result_text = "Done"
                    error_text = error.strip() or "No Error"
                else:
                    result_text = "Unknown response"
                    error_text = error.strip() or "No output"

                ws.append([host, result_text, error_text])
                self._update_server_row(host, 100, "Completed", result_text)
                self.log(f"Finished with {host}: {result_text}")
                client.close()
            except Exception as exc:  # pragma: no cover - user feedback only
                ws.append([host, "Error", str(exc)])
                self._update_server_row(host, 100, "Error", str(exc))
                self.log(f"Error on {host}: {exc}")

            self._update_overall_progress(index)

        file_path = self._save_workbook(wb)
        self.log(f"Results saved to {file_path}")
        self._on_completion()

    def _update_server_row(self, host: str, progress: int, status: str, detail: str) -> None:
        def callback() -> None:
            row = self.server_rows.get(host)
            if row:
                row.update(progress, status, detail)

        self.root.after(0, callback)

    def _update_overall_progress(self, completed: int) -> None:
        self.root.after(0, lambda: self.overall_progress.configure(value=completed))

    def _on_completion(self) -> None:
        def callback() -> None:
            self.status_message.configure(text="Done")
            self.run_button.configure(state="normal")

        self.root.after(0, callback)

    def _save_workbook(self, workbook: Workbook) -> Path:
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        file_path = Path.cwd() / f"ssh_command_results_{timestamp}.xlsx"
        workbook.save(file_path)
        return file_path


def main() -> None:
    root = Tk()
    SSHUpdateManager(root)
    root.mainloop()


if __name__ == "__main__":
    main()
