import ast
import math
import operator
import re
import tkinter as tk
from tkinter import messagebox, ttk


FUNCTIONS = {
	"sin": math.sin,
	"cos": math.cos,
	"tan": math.tan,
	"sqrt": math.sqrt,
	"log": math.log10,
	"ln": math.log,
	"abs": abs,
}

GRAPH_COLORS = (
	("#1769aa", "#d35400"),
	("#c0392b", "#16a085"),
	("#7b2cbf", "#2a9d8f"),
	("#34495e", "#f39c12"),
)


class CalculatorApp:
	def __init__(self, root):
		self.root = root
		self.root.title("공학용 계산기")
		self.root.resizable(False, False)
		self.root.configure(background="#eef2f7")
		style = ttk.Style()
		style.configure("TButton", font=("Segoe UI", 10), padding=5)
		style.configure("TEntry", font=("Segoe UI", 10), padding=4)
		style.configure("TLabel", background="#eef2f7", foreground="#243447")
		style.configure("TLabelframe", background="#eef2f7")
		style.configure("TLabelframe.Label", background="#eef2f7", foreground="#243447", font=("Arial", 11, "bold"))
		self.graph_width = 500
		self.graph_height = 500
		self.graph_margin = 45
		self.parameters = {}
		self.parameter_names = []
		self.pan_start_x = None
		self.pan_start_minimum = None
		self.pan_start_maximum = None
		self.expression = tk.StringVar()
		self.display = tk.Entry(root, textvariable=self.expression, font=("Segoe UI", 24, "bold"), justify="right", width=24, state="readonly", readonlybackground="#172b4d", foreground="#ffffff", relief="flat", bd=0)
		self.display.grid(row=0, column=0, columnspan=6, padx=10, pady=10)

		buttons = [
			("sin(", 1, 0), ("cos(", 1, 1), ("tan(", 1, 2), ("log(", 1, 3), ("ln(", 1, 4), ("sqrt(", 1, 5),
			("7", 2, 0), ("8", 2, 1), ("9", 2, 2), ("/", 2, 3), ("^", 2, 4), ("pi", 2, 5),
			("4", 3, 0), ("5", 3, 1), ("6", 3, 2), ("*", 3, 3), ("(", 3, 4), (")", 3, 5),
			("1", 4, 0), ("2", 4, 1), ("3", 4, 2), ("-", 4, 3), ("e", 4, 4), (".", 4, 5),
			("0", 5, 0), ("+", 5, 1), ("C", 5, 2), ("⌫", 5, 3), ("=", 5, 4),
		]
		for text, row, column in buttons:
			command = self.calculate if text == "=" else self.clear if text == "C" else self.delete_last if text == "⌫" else lambda value=text: self.add_to_expression(value)
			if text == "=":
				background, foreground = "#1769aa", "white"
			elif text in ("+", "-", "*", "/", "^"):
				background, foreground = "#dce8f5", "#1769aa"
			elif text in ("C", "⌫"):
				background, foreground = "#f0d9d5", "#a33a2b"
			else:
				background, foreground = "#ffffff", "#243447"
			tk.Button(root, text=text, width=6, height=2, font=("Segoe UI", 11), relief="flat", bd=0, background=background, foreground=foreground, activebackground="#b9d4ed", command=command).grid(row=row, column=column, padx=3, pady=3)

		equation_frame = ttk.LabelFrame(root, text="일반 방정식 f(x) = g(x)")
		equation_frame.grid(row=6, column=0, columnspan=6, padx=10, pady=10, sticky="ew")
		ttk.Label(equation_frame, text="식:").grid(row=0, column=0, padx=3, pady=5)
		self.left_entry = ttk.Entry(equation_frame, width=18)
		self.left_entry.grid(row=0, column=1, padx=3, pady=5)
		tk.Label(equation_frame, text="=").grid(row=0, column=2)
		self.right_entry = ttk.Entry(equation_frame, width=12)
		self.right_entry.grid(row=0, column=3, padx=3, pady=5)
		self.equation_rows = [(self.left_entry, self.right_entry)]
		self.equation_inputs_frame = ttk.Frame(equation_frame)
		self.equation_inputs_frame.grid(row=2, column=0, columnspan=5, padx=3, pady=2, sticky="w")
		ttk.Button(equation_frame, text="+ 식 추가", command=self.add_equation_row).grid(row=0, column=4, padx=3, pady=5)
		tk.Label(equation_frame, text="구간:").grid(row=1, column=0, padx=3, pady=5)
		self.minimum_entry = ttk.Entry(equation_frame, width=8)
		self.minimum_entry.insert(0, "-10")
		self.minimum_entry.grid(row=1, column=1, sticky="w", padx=3, pady=5)
		self.maximum_entry = ttk.Entry(equation_frame, width=8)
		self.maximum_entry.insert(0, "10")
		self.maximum_entry.grid(row=1, column=1, sticky="e", padx=3, pady=5)
		ttk.Button(equation_frame, text="실수 해 찾기", command=self.solve_equation).grid(row=1, column=2, padx=3, pady=5)
		self.equation_result = ttk.Label(equation_frame, text="예: sin(x) = 0.5 또는 x^3 - 2*x - 5 = 0")
		self.equation_result.grid(row=3, column=0, columnspan=5, padx=3, pady=5)
		ttk.Button(equation_frame, text="그래프 그리기", command=self.plot_graph).grid(row=1, column=3, padx=3, pady=5)
		ttk.Button(equation_frame, text="범위 초기화", command=self.reset_range).grid(row=1, column=4, padx=3, pady=5)
		tk.Button(equation_frame, text="범위 없음(자동)", command=self.clear_range).grid(row=4, column=0, columnspan=5, padx=3, pady=5)

		graph_frame = ttk.LabelFrame(root, text="그래프")
		graph_frame.grid(row=0, column=6, rowspan=7, padx=10, pady=10)
		self.graph = tk.Canvas(graph_frame, width=self.graph_width, height=self.graph_height, background="white", highlightthickness=1, highlightbackground="#c8d2df")
		self.graph.pack(padx=5, pady=5)
		self.graph.bind("<MouseWheel>", self.zoom_graph)
		self.graph.bind("<Button-4>", self.zoom_graph)
		self.graph.bind("<Button-5>", self.zoom_graph)
		self.graph.bind("<Button-3>", self.start_pan)
		self.graph.bind("<B3-Motion>", self.pan_graph)
		self.graph.bind("<ButtonRelease-3>", self.end_pan)
		ttk.Label(graph_frame, text="마우스 휠: 그래프 확대 / 축소").pack(pady=(0, 6))
		self.parameter_frame = ttk.LabelFrame(graph_frame, text="변수 조절")
		self.parameter_frame.pack(fill="x", padx=5, pady=(0, 6))
		self.parameter_controls = {}
		self.update_parameter_controls()
		self.plot_graph()

	def add_to_expression(self, value):
		self.expression.set(self.expression.get() + value)

	def add_equation_row(self):
		row = len(self.equation_rows)
		row_frame = ttk.Frame(self.equation_inputs_frame)
		row_frame.grid(row=row, column=0, padx=3, pady=2, sticky="w")
		left = ttk.Entry(row_frame, width=18)
		right = ttk.Entry(row_frame, width=12)
		left.pack(side="left", padx=3)
		ttk.Label(row_frame, text="=").pack(side="left")
		right.insert(0, "0")
		right.pack(side="left", padx=3)
		tk.Button(row_frame, text="그래프 그리기", command=self.plot_graph).pack(side="left", padx=3)
		tk.Button(row_frame, text="×", width=3, command=lambda: self.remove_equation_row(left, right, row_frame)).pack(side="left", padx=3)
		self.equation_rows.append((left, right))

	def remove_equation_row(self, left, right, row_frame):
		if len(self.equation_rows) <= 1:
			return
		self.equation_rows.remove((left, right))
		row_frame.destroy()
		self.update_parameter_controls()
		self.plot_graph()

	def get_equations(self):
		return [(left.get().strip(), right.get().strip()) for left, right in self.equation_rows if left.get().strip() and right.get().strip()]

	def clear(self):
		self.expression.set("")

	def delete_last(self):
		self.expression.set(self.expression.get()[:-1])

	def reset_range(self):
		self.minimum_entry.delete(0, tk.END)
		self.minimum_entry.insert(0, "-10")
		self.maximum_entry.delete(0, tk.END)
		self.maximum_entry.insert(0, "10")
		self.plot_graph()

	def clear_range(self):
		self.minimum_entry.delete(0, tk.END)
		self.maximum_entry.delete(0, tk.END)
		self.equation_result.config(text="자동 탐색: -10부터 범위를 넓혀가며 실수 해를 찾습니다.")
		self.plot_graph()

	def update_parameter_controls(self):
		expressions = [value for equation in self.get_equations() for value in equation]
		names = find_parameters(*expressions)
		if names == self.parameter_names:
			return
		for child in self.parameter_frame.winfo_children():
			child.destroy()
		self.parameter_names = names
		self.parameter_controls = {}
		if not names:
			ttk.Label(self.parameter_frame, text="식에 조절 가능한 변수가 없습니다.").pack(padx=5, pady=5)
			return
		for name in names:
			self.parameters.setdefault(name, 0.0)
			row = ttk.Frame(self.parameter_frame)
			row.pack(fill="x", padx=4, pady=2)
			value_label = ttk.Label(row, text=f"{name} = {format_number(self.parameters[name])}", width=14)
			value_label.pack(side="left")
			value_entry = ttk.Entry(row, width=8)
			value_entry.insert(0, format_number(self.parameters[name]))
			value_entry.pack(side="left", padx=(0, 4))
			value_entry.bind("<Return>", lambda event, variable=name, entry=value_entry: self.change_parameter_from_entry(variable, entry))
			value_entry.bind("<FocusOut>", lambda event, variable=name, entry=value_entry: self.change_parameter_from_entry(variable, entry))
			scale = tk.Scale(row, from_=-20, to=20, resolution=0.1, orient="horizontal", showvalue=False, length=220, highlightthickness=0, bd=0, background="#eef2f7", command=lambda value, variable=name: self.change_parameter(variable, value))
			scale.set(self.parameters[name])
			scale.pack(side="left", fill="x", expand=True)
			self.parameter_controls[name] = (scale, value_label, value_entry)

	def change_parameter(self, name, value):
		self.parameters[name] = float(value)
		if name in self.parameter_controls:
			scale, value_label, value_entry = self.parameter_controls[name]
			value_label.config(text=f"{name} = {format_number(self.parameters[name])}")
			if self.root.focus_get() != value_entry:
				value_entry.delete(0, tk.END)
				value_entry.insert(0, format_number(self.parameters[name]))
		self.update_roots_display()
		self.plot_graph()

	def change_parameter_from_entry(self, name, entry):
		try:
			value = float(entry.get())
			if not -20 <= value <= 20:
				raise ValueError
			self.parameters[name] = value
			if name in self.parameter_controls:
				scale, value_label, value_entry = self.parameter_controls[name]
				scale.set(value)
				value_label.config(text=f"{name} = {format_number(value)}")
			self.update_roots_display()
			self.plot_graph()
		except ValueError:
			entry.delete(0, tk.END)
			entry.insert(0, format_number(self.parameters.get(name, 0.0)))

	def zoom_graph(self, event):
		try:
			minimum = float(self.minimum_entry.get())
			maximum = float(self.maximum_entry.get())
			if minimum >= maximum:
				raise ValueError
			zoom_in = getattr(event, "delta", 0) > 0 or getattr(event, "num", 0) == 4
			factor = 0.8 if zoom_in else 1.25
			plot_width = self.graph_width - self.graph_margin * 2
			mouse_ratio = min(1, max(0, (event.x - self.graph_margin) / plot_width))
			mouse_value = minimum + (maximum - minimum) * mouse_ratio
			new_minimum = mouse_value - (mouse_value - minimum) * factor
			new_maximum = mouse_value + (maximum - mouse_value) * factor
			self.minimum_entry.delete(0, tk.END)
			self.minimum_entry.insert(0, format_number(new_minimum))
			self.maximum_entry.delete(0, tk.END)
			self.maximum_entry.insert(0, format_number(new_maximum))
			self.plot_graph()
		except (ValueError, TypeError):
			return

	def start_pan(self, event):
		try:
			self.pan_start_x = event.x
			self.pan_start_minimum = float(self.minimum_entry.get())
			self.pan_start_maximum = float(self.maximum_entry.get())
		except ValueError:
			self.pan_start_x = None
			return
		self.graph.configure(cursor="fleur")

	def pan_graph(self, event):
		if self.pan_start_x is None:
			return
		plot_width = self.graph_width - self.graph_margin * 2
		range_width = self.pan_start_maximum - self.pan_start_minimum
		shift = -(event.x - self.pan_start_x) * range_width / plot_width
		minimum = self.pan_start_minimum + shift
		maximum = self.pan_start_maximum + shift
		self.minimum_entry.delete(0, tk.END)
		self.minimum_entry.insert(0, format_number(minimum))
		self.maximum_entry.delete(0, tk.END)
		self.maximum_entry.insert(0, format_number(maximum))
		self.plot_graph()

	def end_pan(self, event):
		self.pan_start_x = None
		self.graph.configure(cursor="")

	def calculate(self):
		try:
			self.expression.set(format_number(evaluate_expression(self.expression.get())))
		except (ValueError, SyntaxError, ZeroDivisionError, TypeError):
			messagebox.showerror("계산 오류", "올바른 계산식을 입력하세요.")

	def update_roots_display(self):
		try:
			equations = self.get_equations()
			if not equations:
				return
			left, right = equations[0]
			minimum_text = self.minimum_entry.get().strip()
			maximum_text = self.maximum_entry.get().strip()
			if minimum_text and maximum_text:
				roots = find_roots(left, right, float(minimum_text), float(maximum_text), self.parameters)
			else:
				roots = find_roots_auto(left, right, self.parameters)
			self.equation_result.config(text="해: " + ", ".join(format_number(root) for root in roots) if roots else "해를 찾지 못했습니다.")
		except (ValueError, SyntaxError, ZeroDivisionError, TypeError, OverflowError):
			return

	def solve_equation(self):
		try:
			equations = self.get_equations()
			if not equations:
				raise ValueError
			left, right = equations[0]
			self.update_parameter_controls()
			if self.minimum_entry.get().strip() or self.maximum_entry.get().strip():
				minimum = float(self.minimum_entry.get())
				maximum = float(self.maximum_entry.get())
				roots = find_roots(left, right, minimum, maximum, self.parameters)
			else:
				roots = find_roots_auto(left, right, self.parameters)
			self.equation_result.config(text="해: " + ", ".join(format_number(root) for root in roots) if roots else "해를 찾지 못했습니다.")
			self.plot_graph(roots)
		except (ValueError, SyntaxError, ZeroDivisionError, TypeError):
			messagebox.showerror("입력 오류", "식과 구간을 올바르게 입력하세요.")

	def plot_graph(self, roots=None):
		try:
			equations = self.get_equations()
			if not equations:
				self.graph.delete("all")
				self.graph.create_text(self.graph_width / 2, self.graph_height / 2, text="함수식을 입력하세요.", fill="#65758b")
				return
			left, right = equations[0]
			if not left.strip() or not right.strip():
				self.graph.delete("all")
				self.graph.create_text(self.graph_width / 2, self.graph_height / 2, text="함수식을 입력하세요.", fill="#65758b")
				return
			self.update_parameter_controls()
			minimum_text = self.minimum_entry.get().strip()
			maximum_text = self.maximum_entry.get().strip()
			minimum = float(minimum_text) if minimum_text else -10
			maximum = float(maximum_text) if maximum_text else 10
			if minimum >= maximum:
				raise ValueError
			has_implicit = any(has_variable(expression, "y") for equation in equations for expression in equation)
			if has_variable(left, "y") or has_variable(right, "y"):
				self.draw_implicit_graph(left, right, minimum, maximum, color=GRAPH_COLORS[0][0])
				for equation_index, (extra_left, extra_right) in enumerate(equations[1:], start=1):
					colors = GRAPH_COLORS[equation_index % len(GRAPH_COLORS)]
					if has_variable(extra_left, "y") or has_variable(extra_right, "y"):
						self.draw_implicit_graph(extra_left, extra_right, minimum, maximum, clear=False, color=colors[0])
					else:
						self.draw_graph(extra_left, extra_right, minimum, maximum, clear=False, y_bounds=(minimum, maximum), colors=colors)
				return
			if roots is None:
				roots = find_roots(left, right, minimum, maximum, self.parameters) if minimum_text and maximum_text else find_roots_auto(left, right, self.parameters)
			self.draw_graph(left, right, minimum, maximum, roots, y_bounds=(minimum, maximum) if has_implicit else None, colors=GRAPH_COLORS[0])
			for equation_index, (extra_left, extra_right) in enumerate(equations[1:], start=1):
				colors = GRAPH_COLORS[equation_index % len(GRAPH_COLORS)]
				if has_variable(extra_left, "y") or has_variable(extra_right, "y"):
					self.draw_implicit_graph(extra_left, extra_right, minimum, maximum, clear=False, color=colors[0])
				else:
					self.draw_graph(extra_left, extra_right, minimum, maximum, clear=False, y_bounds=(minimum, maximum) if has_implicit else None, colors=colors)
		except (ValueError, SyntaxError, ZeroDivisionError, TypeError, OverflowError):
			self.graph.delete("all")
			self.graph.create_text(self.graph_width / 2, self.graph_height / 2, text="그래프를 그릴 수 없습니다.", fill="red")

	def draw_graph(self, left, right, minimum, maximum, roots=None, clear=True, y_bounds=None, colors=None):
		margin = self.graph_margin
		plot_width = self.graph_width - margin * 2
		plot_height = self.graph_height - margin * 2
		point_count = 700
		left_points = []
		right_points = []
		all_values = []
		left_color, right_color = colors or GRAPH_COLORS[0]
		left_tree = compile_expression(left)
		right_tree = compile_expression(right)
		for index in range(point_count + 1):
			x_value = minimum + (maximum - minimum) * index / point_count
			for tree, points in ((left_tree, left_points), (right_tree, right_points)):
				try:
					y_value = evaluate_node(tree, x_value, self.parameters)
					if math.isfinite(y_value):
						points.append((x_value, y_value))
						all_values.append(y_value)
					else:
						points.append(None)
				except (ValueError, ZeroDivisionError, TypeError, OverflowError):
					points.append(None)
		if not all_values:
			raise ValueError
		if y_bounds is None:
			y_min, y_max = min(all_values), max(all_values)
			if y_min == y_max:
				y_min -= 1
				y_max += 1
			else:
				padding = (y_max - y_min) * 0.08
				y_min -= padding
				y_max += padding
		else:
			y_min, y_max = y_bounds

		to_canvas_x = lambda value: margin + (value - minimum) / (maximum - minimum) * plot_width
		to_canvas_y = lambda value: margin + (y_max - value) / (y_max - y_min) * plot_height
		if clear:
			self.graph.delete("all")
		self.graph.create_rectangle(margin, margin, margin + plot_width, margin + plot_height, outline="#cccccc")
		x_axis = to_canvas_x(0) if minimum <= 0 <= maximum else margin
		y_axis = to_canvas_y(0) if y_min <= 0 <= y_max else margin + plot_height
		self.graph.create_line(x_axis, margin, x_axis, margin + plot_height, fill="#777777", width=2)
		self.graph.create_line(margin, y_axis, margin + plot_width, y_axis, fill="#777777", width=2)
		self.graph.create_text(x_axis + 8, margin + 12, text="y", fill="#555555", anchor="w")
		self.graph.create_text(margin + plot_width - 8, y_axis - 10, text="x", fill="#555555", anchor="e")
		self.graph.create_text(margin, margin - 18, text=f"x: {format_number(minimum)} ~ {format_number(maximum)}", anchor="w")
		self.graph.create_text(margin, self.graph_height - 15, text=f"y: {format_number(y_min)} ~ {format_number(y_max)}", anchor="w")
		self.draw_curve(left_points, to_canvas_x, to_canvas_y, left_color)
		self.draw_curve(right_points, to_canvas_x, to_canvas_y, right_color)
		if roots is not None:
			for root in roots:
				try:
					y_value = evaluate_node(left_tree, root, self.parameters)
					x_pixel = to_canvas_x(root)
					y_pixel = to_canvas_y(y_value)
					self.graph.create_oval(x_pixel - 5, y_pixel - 5, x_pixel + 5, y_pixel + 5, fill="#c0392b", outline="white", width=1)
					self.graph.create_text(x_pixel + 8, y_pixel - 8, text=f"x={format_number(root)}", fill="#c0392b", anchor="w")
				except (ValueError, ZeroDivisionError, TypeError, OverflowError):
					continue
		if clear:
			self.graph.create_text(self.graph_width - 12, 15, text="f(x)", fill=left_color, anchor="e")
			self.graph.create_text(self.graph_width - 12, 32, text="g(x)", fill=right_color, anchor="e")

	def draw_implicit_graph(self, left, right, minimum, maximum, clear=True, color="#1769aa"):
		margin = self.graph_margin
		plot_width = self.graph_width - margin * 2
		plot_height = self.graph_height - margin * 2
		to_x = lambda value: margin + (value - minimum) / (maximum - minimum) * plot_width
		to_y = lambda value: margin + (maximum - value) / (maximum - minimum) * plot_height
		left_tree = compile_expression(left)
		right_tree = compile_expression(right)
		equation = lambda x_value, y_value: evaluate_node(left_tree, x_value, {**self.parameters, "y": y_value}) - evaluate_node(right_tree, x_value, {**self.parameters, "y": y_value})
		conic = detect_conic(equation)
		if conic is not None and conic[6] in ("원", "타원", "쌍곡선") and abs(conic[1]) < 1e-8:
			self.draw_conic(conic, minimum, maximum, clear=clear, color=color)
			return

		if clear:
			self.graph.delete("all")
		x_axis = to_x(0) if minimum <= 0 <= maximum else margin
		y_axis = to_y(0) if minimum <= 0 <= maximum else margin + plot_height
		self.graph.create_line(x_axis, margin, x_axis, margin + plot_height, fill="#777777", width=2)
		self.graph.create_line(margin, y_axis, margin + plot_width, y_axis, fill="#777777", width=2)
		if clear:
			self.graph.create_text(margin, margin - 18, text=f"암시적 그래프: {left} = {right}", anchor="w", fill="#243447")

		x_count = 260
		y_count = 160
		x_values = [minimum + (maximum - minimum) * index / x_count for index in range(x_count + 1)]
		y_values = [minimum + (maximum - minimum) * index / y_count for index in range(y_count + 1)]
		grid = []
		for x_value in x_values:
			column = []
			for y_value in y_values:
				try:
					value = equation(x_value, y_value)
					column.append(value if math.isfinite(value) else None)
				except (ValueError, ZeroDivisionError, TypeError, OverflowError):
					column.append(None)
			grid.append(column)

		for x_index in range(x_count):
			for y_index in range(y_count):
				corners = (grid[x_index][y_index], grid[x_index + 1][y_index], grid[x_index + 1][y_index + 1], grid[x_index][y_index + 1])
				if any(value is None for value in corners):
					continue
				case = sum((1, 2, 4, 8)[index] for index, value in enumerate(corners) if value >= 0)
				points = (
					(interpolate(x_values[x_index], x_values[x_index + 1], corners[0], corners[1]), y_values[y_index]),
					(x_values[x_index + 1], interpolate(y_values[y_index], y_values[y_index + 1], corners[1], corners[2])),
					(interpolate(x_values[x_index], x_values[x_index + 1], corners[3], corners[2]), y_values[y_index + 1]),
					(x_values[x_index], interpolate(y_values[y_index], y_values[y_index + 1], corners[0], corners[3])),
				)
				for first_edge, second_edge in marching_segments(case):
					first = points[first_edge]
					second = points[second_edge]
					self.graph.create_line(to_x(first[0]), to_y(first[1]), to_x(second[0]), to_y(second[1]), fill=color, width=2)

	def draw_conic(self, conic, minimum, maximum, clear=True, color="#1769aa"):
		A, B, C, D, E, F, conic_type = conic
		margin = self.graph_margin
		plot_width = self.graph_width - margin * 2
		plot_height = self.graph_height - margin * 2
		to_x = lambda value: margin + (value - minimum) / (maximum - minimum) * plot_width
		to_y = lambda value: margin + (maximum - value) / (maximum - minimum) * plot_height
		x_axis = to_x(0) if minimum <= 0 <= maximum else margin
		y_axis = to_y(0) if minimum <= 0 <= maximum else margin + plot_height
		if clear:
			self.graph.delete("all")
		self.graph.create_line(x_axis, margin, x_axis, margin + plot_height, fill="#777777", width=2)
		self.graph.create_line(margin, y_axis, margin + plot_width, y_axis, fill="#777777", width=2)
		center_x = (B * E - 2 * C * D) / (4 * A * C - B * B)
		center_y = (B * D - 2 * A * E) / (4 * A * C - B * B)
		center_value = A * center_x ** 2 + C * center_y ** 2 + D * center_x + E * center_y + F
		if conic_type in ("원", "타원"):
			radius_x = math.sqrt(max(0, -center_value / A))
			radius_y = math.sqrt(max(0, -center_value / C))
			points = [(center_x + radius_x * math.cos(angle), center_y + radius_y * math.sin(angle)) for angle in [2 * math.pi * index / 360 for index in range(361)]]
		else:
			radius_x = math.sqrt(abs(-center_value / A))
			radius_y = math.sqrt(abs(-center_value / C))
			points = []
			for sign in (-1, 1):
				for index in range(161):
					parameter = -3 + 6 * index / 160
					points.append((center_x + sign * radius_x * math.cosh(parameter), center_y + radius_y * math.sinh(parameter)))
		self.draw_curve([(x_value, y_value) for x_value, y_value in points], to_x, to_y, color)
		if clear:
			self.graph.create_text(margin, margin - 18, text=f"{conic_type}: {center_x:.3g}, {center_y:.3g}", anchor="w", fill="#243447")

	def draw_curve(self, points, to_canvas_x, to_canvas_y, color):
		segment = []
		for point in points:
			if point is None:
				if len(segment) > 1:
					coordinates = [coordinate for item in segment for coordinate in item]
					self.graph.create_line(*coordinates, fill=color, width=2, smooth=True)
				segment = []
				continue
			segment.append((to_canvas_x(point[0]), to_canvas_y(point[1])))
		if len(segment) > 1:
			coordinates = [coordinate for item in segment for coordinate in item]
			self.graph.create_line(*coordinates, fill=color, width=2, smooth=True)


def evaluate_expression(expression, x=None, variables=None):
	return evaluate_node(compile_expression(expression), x, variables or {})


def compile_expression(expression):
	return ast.parse(normalize_expression(expression), mode="eval").body


def normalize_expression(expression):
	expression = expression.replace("^", "**")
	expression = re.sub(r"(?<=[0-9)])(?=[A-Za-z_(])", "*", expression)
	return expression


def evaluate_node(node, x=None, variables=None):
	variables = variables or {}
	operators = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv, ast.Pow: operator.pow, ast.USub: operator.neg, ast.UAdd: operator.pos}
	if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
		return node.value
	if isinstance(node, ast.Name):
		values = {"pi": math.pi, "e": math.e, "x": x, **variables}
		if node.id in values and values[node.id] is not None:
			return values[node.id]
	if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in FUNCTIONS:
		return FUNCTIONS[node.func.id](*(evaluate_node(argument, x, variables) for argument in node.args))
	if isinstance(node, ast.BinOp) and type(node.op) in operators:
		return operators[type(node.op)](evaluate_node(node.left, x, variables), evaluate_node(node.right, x, variables))
	if isinstance(node, ast.UnaryOp) and type(node.op) in operators:
		return operators[type(node.op)](evaluate_node(node.operand, x, variables))
	raise ValueError("지원하지 않는 식입니다.")


def has_variable(expression, variable):
	try:
		tree = ast.parse(normalize_expression(expression), mode="eval")
	except SyntaxError:
		return False
	return any(isinstance(node, ast.Name) and node.id == variable for node in ast.walk(tree))


def detect_conic(equation):
	samples = ((0, 0), (1, 0), (0, 1), (1, 1), (2, 0), (0, 2))
	matrix = [[x_value ** 2, x_value * y_value, y_value ** 2, x_value, y_value, 1] for x_value, y_value in samples]
	try:
		values = [-equation(x_value, y_value) for x_value, y_value in samples]
		coefficients = solve_linear_system(matrix, values)
		if max(abs(value) for value in coefficients) == 0:
			return None
		check_points = ((-2, -1), (-1, 2), (2, 2), (3, -2))
		for x_value, y_value in check_points:
			predicted = sum(coefficient * term for coefficient, term in zip(coefficients, (x_value ** 2, x_value * y_value, y_value ** 2, x_value, y_value, 1)))
			actual = equation(x_value, y_value)
			if abs(predicted + actual) > 1e-5 * max(1, abs(actual), abs(predicted)):
				return None
		A, B, C, D, E, F = coefficients
		discriminant = B * B - 4 * A * C
		if discriminant < -1e-8 and abs(A - C) <= 1e-8 and abs(B) <= 1e-8:
			conic_type = "원"
		else:
			conic_type = "타원" if discriminant < -1e-8 else "포물선" if abs(discriminant) <= 1e-8 else "쌍곡선"
		return A, B, C, D, E, F, conic_type
	except (ValueError, ZeroDivisionError, TypeError, OverflowError):
		return None


def solve_linear_system(matrix, values):
	augmented = [row[:] + [value] for row, value in zip(matrix, values)]
	for column in range(len(values)):
		pivot = max(range(column, len(values)), key=lambda row: abs(augmented[row][column]))
		if abs(augmented[pivot][column]) < 1e-12:
			raise ValueError("계수를 구할 수 없습니다.")
		augmented[column], augmented[pivot] = augmented[pivot], augmented[column]
		divisor = augmented[column][column]
		augmented[column] = [value / divisor for value in augmented[column]]
		for row in range(len(values)):
			if row != column:
				factor = augmented[row][column]
				augmented[row] = [current - factor * pivot_value for current, pivot_value in zip(augmented[row], augmented[column])]
	return [augmented[row][-1] for row in range(len(values))]


def find_parameters(*expressions):
	standard_names = {"x", "y", "pi", "e", *FUNCTIONS}
	names = set()
	for expression in expressions:
		try:
			tree = ast.parse(normalize_expression(expression), mode="eval")
		except SyntaxError:
			continue
		for node in ast.walk(tree):
			if isinstance(node, ast.Name) and node.id not in standard_names:
				names.add(node.id)
	return sorted(names)


def find_roots(left, right, minimum, maximum, variables=None):
	if minimum >= maximum:
		raise ValueError("잘못된 구간")
	left_tree = compile_expression(left)
	right_tree = compile_expression(right)
	function = lambda value: evaluate_node(left_tree, value, variables or {}) - evaluate_node(right_tree, value, variables or {})
	roots = []
	step = (maximum - minimum) / 2000
	previous_x = minimum
	try:
		previous_y = function(previous_x)
	except (ValueError, ZeroDivisionError, TypeError, OverflowError):
		previous_y = None
	for index in range(1, 2001):
		x_value = minimum + index * step
		try:
			y_value = function(x_value)
		except (ValueError, ZeroDivisionError, TypeError, OverflowError):
			previous_x, previous_y = x_value, None
			continue
		if y_value == 0:
			roots.append(x_value)
		elif previous_y is not None and previous_y * y_value < 0:
			roots.append(bisection(function, previous_x, x_value))
		previous_x, previous_y = x_value, y_value
	return unique_roots(roots)


def find_roots_auto(left, right, variables=None):
	roots = []
	for limit in (10, 100, 1000):
		try:
			roots.extend(find_roots(left, right, -limit, limit, variables))
		except (ValueError, SyntaxError, ZeroDivisionError, TypeError, OverflowError):
			continue
	return unique_roots(roots)


def bisection(function, left, right):
	for _ in range(60):
		middle = (left + right) / 2
		if function(middle) == 0:
			return middle
		if function(left) * function(middle) <= 0:
			right = middle
		else:
			left = middle
	return (left + right) / 2


def interpolate(first_position, second_position, first_value, second_value):
	if first_value == second_value:
		return (first_position + second_position) / 2
	ratio = -first_value / (second_value - first_value)
	return first_position + ratio * (second_position - first_position)


def marching_segments(case):
	segments = {
		0: (), 1: ((3, 0),), 2: ((0, 1),), 3: ((3, 1),),
		4: ((1, 2),), 5: ((3, 2), (0, 1)), 6: ((0, 2),), 7: ((3, 2),),
		8: ((2, 3),), 9: ((0, 2),), 10: ((0, 1), (2, 3)), 11: ((1, 2),),
		12: ((1, 3),), 13: ((0, 1),), 14: ((3, 0),), 15: (),
	}
	return segments[case]


def bisection_variable(function, left, right):
	for _ in range(40):
		middle = (left + right) / 2
		if function(left) * function(middle) <= 0:
			right = middle
		else:
			left = middle
	return (left + right) / 2


def to_canvas_y(value, minimum, maximum, margin, plot_height):
	return margin + (maximum - value) / (maximum - minimum) * plot_height


def unique_roots(roots):
	result = []
	for root in sorted(roots):
		if not result or abs(root - result[-1]) > 1e-5:
			result.append(root)
	return result


def format_number(value):
	return str(int(value)) if value == int(value) else f"{value:.10g}"


if __name__ == "__main__":
	root = tk.Tk()
	CalculatorApp(root)
	root.mainloop()
