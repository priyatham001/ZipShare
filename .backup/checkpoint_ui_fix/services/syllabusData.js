// Official Syllabus Definition - Source of Truth for ZipShare V3

const JAVA_EXPERIMENTS = [
  { number: 1, name: "Default Values of Primitive Datatypes using Static Keyword", keywords: ["default values", "defaultvalues", "primitive datatypes", "static keyword", "default value", "primitives"] },
  { number: 2, name: "Roots of Quadratic Equation", keywords: ["quadratic", "quadratic roots", "roots of quadratic equation", "quadraticroots", "roots"] },
  { number: 3, name: "Classes and Objects Implementation", keywords: ["classes and objects", "class mechanism", "box", "student class", "classes and objects implementation", "class"] },
  { number: 4, name: "Method Overloading with addfunc() Methods", keywords: ["method overloading", "addfunc", "methodoverloading", "overloading"] },
  { number: 5, name: "Time Display", keywords: ["time display", "timedisplay", "time class", "hours minutes seconds", "time"] },
  { number: 6, name: "Bank Account using this Keyword", keywords: ["bank account", "this keyword", "bankaccount", "bank", "account this"] },
  { number: 7, name: "Binary Search", keywords: ["binary search", "binarysearch"] },
  { number: 8, name: "Bubble Sort Technique", keywords: ["bubble sort", "bubblesort", "bubble sort technique"] },
  { number: 9, name: "Sort the Scores", keywords: ["sort the scores", "sort scores", "scores sort", "score sorting"] },
  { number: 10, name: "Print Student ID and Name using HashMap", keywords: ["hashmap", "student id and name", "hash map", "print student id"] },
  { number: 11, name: "Hash Set – Set Operations", keywords: ["hash set", "hashset", "set operations", "union intersection set"] },
  { number: 12, name: "Perform Basic String Operations", keywords: ["basic string operations", "string operations", "string methods", "string manipulation"] },
  { number: 13, name: "Implementing String Buffer", keywords: ["string buffer", "stringbuffer", "implementing string buffer"] },
  { number: 14, name: "Pen Name - Inheritance 2", keywords: ["pen name", "inheritance 2", "pen name inheritance", "pen"] },
  { number: 15, name: "Multi-Level Inheritance with Method Overriding", keywords: ["multi-level inheritance", "multilevel inheritance", "method overriding", "overriding"] },
  { number: 16, name: "Area of Shapes using Abstract Classes", keywords: ["area of shapes", "abstract classes", "abstract class", "shape area", "shapes abstract"] },
  { number: 17, name: "Vehicle Service Center", keywords: ["vehicle service center", "vehicle service", "vehicle", "service center"] },
  { number: 18, name: "Super Keyword", keywords: ["super keyword", "super", "super constructor", "super method"] },
  { number: 19, name: "Total Cost Calculator Using Interface", keywords: ["total cost calculator", "cost calculator", "interface cost", "interface calculator"] },
  { number: 20, name: "Demonstrate the Usage of Package", keywords: ["usage of package", "package demonstration", "package", "packages"] },
  { number: 21, name: "Exception Handling", keywords: ["exception handling", "try catch", "arithmetic exception", "exceptions"] },
  { number: 22, name: "Handle Exceptions", keywords: ["handle exceptions", "exception handler", "custom exception handling"] },
  { number: 23, name: "Null Pointer Exception", keywords: ["null pointer exception", "nullpointerexception", "null pointer"] },
  { number: 24, name: "Multiple Catch Blocks", keywords: ["multiple catch blocks", "multiple catch", "multiple exception catch"] },
  { number: 25, name: "Character Exception", keywords: ["character exception", "custom character exception", "char exception"] },
  { number: 26, name: "Create Multiple Threads", keywords: ["create multiple threads", "multiple threads", "thread creation", "threads"] },
  { number: 27, name: "Multithreading using Runnable Interface", keywords: ["runnable interface", "multithreading runnable", "implements runnable"] },
  { number: 28, name: "Demonstrate Thread Priority and Name Handling", keywords: ["thread priority", "thread name", "name handling", "thread priority and name"] },
  { number: 29, name: "Synchronized Counter using Threads", keywords: ["synchronized counter", "synchronized", "thread counter", "thread synchronization"] },
  { number: 30, name: "Copy the Contents of One File to Another Using Byte-Oriented I/O", keywords: ["byte-oriented", "byte oriented i/o", "fileinputstream", "fileoutputstream", "copy file byte"] },
  { number: 31, name: "Copy Contents of One File into Another Using Character-Oriented I/O", keywords: ["character-oriented", "character oriented i/o", "filereader", "filewriter", "copy file char"] },
  { number: 32, name: "Insert Department Records", keywords: ["insert department records", "insert department", "department insert", "jdbc insert department"] },
  { number: 33, name: "Delete Department Record", keywords: ["delete department record", "delete department", "department delete", "jdbc delete department"] },
  { number: 34, name: "Update Department Record", keywords: ["update department record", "update department", "department update", "jdbc update department"] },
  { number: 35, name: "Fetch Department Records", keywords: ["fetch department records", "fetch department", "department fetch", "select department records", "jdbc fetch"] }
];

const PYTHON_EXPERIMENTS = [
  { number: 1, name: "Largest of Three Numbers", keywords: ["largest of three", "greatest of three", "largest of three numbers", "greatest_of_three", "max of three"] },
  { number: 2, name: "Prime Numbers in an Interval", keywords: ["prime numbers in an interval", "primes in given range", "prime in interval", "primes_in_given_range", "prime interval"] },
  { number: 3, name: "Swapping of Two Numbers", keywords: ["swapping of two numbers", "swap two numbers", "swap", "swapping"] },
  { number: 4, name: "Arithmetic Operations (Addition, Subtraction, Multiplication, Division)", keywords: ["arithmetic operations", "arithmetic", "addition subtraction multiplication division", "basic arithmetic"] },
  { number: 5, name: "Comparison Operators", keywords: ["comparison operators", "relational operators", "comparison", "greater than less than"] },
  { number: 6, name: "Assignment Operations", keywords: ["assignment operations", "assignment operators", "augmented assignment", "compound assignment"] },
  { number: 7, name: "Logical Operators", keywords: ["logical operators", "and or not", "logical operations"] },
  { number: 8, name: "Shift operators", keywords: ["shift operators", "bitwise shift", "left shift right shift", "shift operator"] },
  { number: 9, name: "Ternary Operator", keywords: ["ternary operator", "conditional expression", "ternary"] },
  { number: 10, name: "Membership Operator", keywords: ["membership operator", "in not in", "membership"] },
  { number: 11, name: "Writing using Identity \"is\"", keywords: ["identity is", "identity operator is", "is operator", "using identity is"] },
  { number: 12, name: "Writing an example using identity operator \"is not\"", keywords: ["identity is not", "identity operator is not", "is not operator"] },
  { number: 13, name: "Addition and Multiplication of Two Complex Numbers", keywords: ["complex numbers", "complex addition multiplication", "addition and multiplication of two complex numbers"] },
  { number: 14, name: "Multiplication Table", keywords: ["multiplication table", "math table", "times table", "tables"] },
  { number: 15, name: "Function with Multiple Return Values", keywords: ["multiple return values", "multiple returns", "function multiple return"] },
  { number: 16, name: "Default Arguments Function", keywords: ["default arguments", "default arguments function", "default parameters"] },
  { number: 17, name: "Length of the String", keywords: ["length of the string", "string length", "len of string", "string len"] },
  { number: 18, name: "Substring or Not", keywords: ["substring or not", "check substring", "substring presence", "substring"] },
  { number: 19, name: "List Operations", keywords: ["list operations", "list manipulation", "list methods"] },
  { number: 20, name: "Program using Built in List Functions", keywords: ["built in list functions", "builtin list functions", "append pop insert list"] },
  { number: 21, name: "Tuple Creation", keywords: ["tuple creation", "create tuple", "tuples"] },
  { number: 22, name: "Vowel Count without using Control Flow Statements", keywords: ["vowel count without", "vowel count", "count vowels", "vowels without control flow"] },
  { number: 23, name: "Key Lookup in Dictionary", keywords: ["key lookup in dictionary", "dict key lookup", "key lookup", "dictionary lookup"] },
  { number: 24, name: "Add Key Value Pair to Dictionary", keywords: ["add key value pair to dictionary", "add key value", "dict add", "dictionary insert"] },
  { number: 25, name: "Sum of all Items in a Dictionary", keywords: ["sum of all items in a dictionary", "dict sum", "sum dictionary values"] },
  { number: 26, name: "Copy File contents to another File with Lowered Characters", keywords: ["copy file contents lowered", "lowered characters", "file lower copy", "file lowercase copy"] },
  { number: 27, name: "File Reverse", keywords: ["file reverse", "reverse file contents", "reverse file"] },
  { number: 28, name: "Count Characters, Words, and Lines in a File", keywords: ["count characters words lines", "word count file", "line count file", "wc file"] },
  { number: 29, name: "Array Operations", keywords: ["array operations", "python array module", "array methods"] },
  { number: 30, name: "Matrix Addition", keywords: ["matrix addition", "add two matrices", "matrix add"] },
  { number: 31, name: "Matrix Multiplication", keywords: ["matrix multiplication", "multiply matrices", "matrix multiply"] },
  { number: 32, name: "Transpose of Matrix", keywords: ["transpose of matrix", "matrix transpose", "transpose matrix"] },
  { number: 33, name: "Geometry Class", keywords: ["geometry class", "geometry", "class geometry", "circle rectangle geometry"] },
  { number: 34, name: "Create NumPy Array", keywords: ["create numpy array", "numpy array creation", "np.array", "numpy array"] },
  { number: 35, name: "Slicing and Indexing", keywords: ["slicing and indexing", "numpy slicing", "array slicing indexing"] },
  { number: 36, name: "Numpy Array Operations", keywords: ["numpy array operations", "np array operations", "array operations numpy"] },
  { number: 37, name: "Numpy Array Statistics", keywords: ["numpy array statistics", "numpy mean std var", "array statistics"] },
  { number: 38, name: "Median, Cumulative Sum, and Cumulative Product using NumPy", keywords: ["median cumulative sum cumulative product", "cumsum cumprod", "numpy median cumsum"] },
  { number: 39, name: "Working with Pandas DataFrame", keywords: ["pandas dataframe", "working with pandas dataframe", "dataframe creation", "pandas df"] },
  { number: 40, name: "Pandas - series creation and manipulation", keywords: ["pandas series", "series creation and manipulation", "pd.series"] }
];

const DSA_EXPERIMENTS = [
  { number: 1, name: "Program to implement AVL tree and its operations", keywords: ["avl tree", "avl tree operations", "avl", "self-balancing bst", "avl rotations"] },
  { number: 2, name: "Min Heap Operations", keywords: ["min heap", "min heap operations", "heapify min", "minheap"] },
  { number: 3, name: "Max Heap of Integers", keywords: ["max heap", "max heap of integers", "maxheap", "heapify max"] },
  { number: 4, name: "Implementation of Depth First Search", keywords: ["depth first search", "dfs implementation", "dfs undirected", "dfs graph"] },
  { number: 5, name: "Implementation of Breadth First Search", keywords: ["breadth first search", "bfs implementation", "bfs graph", "bfs queue"] },
  { number: 6, name: "Depth-First Search (DFS) on a Directed Graph", keywords: ["dfs directed graph", "directed graph dfs", "dfs directed"] },
  { number: 7, name: "Directed graph using BFS and Adjacency Matrix", keywords: ["bfs directed graph", "adjacency matrix bfs", "bfs adjacency matrix"] },
  { number: 8, name: "Bi-Connected Components in Graph", keywords: ["bi-connected components", "biconnected components", "articulation points", "biconnected"] },
  { number: 9, name: "Quick Sort", keywords: ["quick sort", "quicksort", "partition quicksort"] },
  { number: 10, name: "Merge Sort", keywords: ["merge sort", "mergesort", "divide and conquer merge"] },
  { number: 11, name: "Shortest Path from source to vertex", keywords: ["shortest path", "dijkstra", "shortest path from source to vertex", "single source shortest path"] },
  { number: 12, name: "Job Sequencing using Greedy Problem", keywords: ["job sequencing", "greedy job sequencing", "job sequencing with deadlines", "greedy job"] },
  { number: 13, name: "Problem on N Queens", keywords: ["n queens", "n-queens", "nqueens", "n queens problem"] },
  { number: 14, name: "Knapsack using backtracking", keywords: ["knapsack backtracking", "knapsack using backtracking", "0/1 knapsack backtracking"] },
  { number: 15, name: "Program to implement Knapsack problem Using Dynamic Programming", keywords: ["knapsack dynamic programming", "knapsack dp", "0/1 knapsack dp", "dynamic programming knapsack"] },
  { number: 16, name: "Travelling Salesman Problem", keywords: ["travelling salesman problem", "traveling salesman", "tsp", "tsp dynamic", "tsp branch and bound"] }
];

const DBMS_EXPERIMENTS = [
  { number: 1, name: "TrafficViolations Table Creation and Data Insertion", module: "Experiment - 1 / Programs", keywords: ["trafficviolations table creation and data insertion", "trafficviolations", "traffic violations", "table creation", "data insertion", "create table trafficviolations", "insert trafficviolations", "trafficviolations table"] },
  { number: 2, name: "DDL - ALTER", module: "Experiment - 1 / Programs", keywords: ["ddl alter", "ddl - alter", "alter table", "alter table add", "alter table modify", "alter"] },
  { number: 3, name: "DDL - DROP", module: "Experiment - 1 / Programs", keywords: ["ddl drop", "ddl - drop", "drop table", "drop table purge", "drop"] },
  { number: 4, name: "DML - SELECT * FROM TABLE - 1 - University Management System", module: "Experiment - 1 / Programs", keywords: ["dml select from table", "university management system", "select * from table", "dml - select", "university management", "select from table", "student_database_schema"] },
  { number: 5, name: "ANY", module: "Experiment - 2 / Programs", keywords: ["any operator", "subquery any", "sql any", "any clause", "where any"] },
  { number: 6, name: "ALL", module: "Experiment - 2 / Programs", keywords: ["all operator", "subquery all", "sql all", "all clause", "where all"] },
  { number: 7, name: "EXISTS", module: "Experiment - 2 / Programs", keywords: ["exists operator", "subquery exists", "sql exists", "exists clause", "where exists", "not exists"] },
  { number: 8, name: "The Lost Scrolls of Time", module: "Experiment - 2 / Programs", keywords: ["the lost scrolls of time", "lost scrolls of time", "scrolls of time", "lost scrolls", "scrolls"] },
  { number: 9, name: "Smart City Streetlight Monitoring", module: "Experiment - 2 / Programs", keywords: ["smart city streetlight monitoring", "streetlight monitoring", "smart city streetlight", "streetlight", "streetlights"] },
  { number: 10, name: "City Waste Collection Report", module: "Experiment - 2 / Programs", keywords: ["city waste collection report", "waste collection report", "city waste collection", "waste collection", "waste report"] },
  { number: 11, name: "Find Common Animal Records", module: "Experiment - 2 / Programs", keywords: ["find common animal records", "common animal records", "animal records", "common animal", "animals intersect"] },
  { number: 12, name: "Aggregate function - COUNT", module: "Experiment - 3 / Programs", keywords: ["aggregate function count", "count function", "count(*)", "count aggregate", "sql count", "count"] },
  { number: 13, name: "Aggregate function - AVG", module: "Experiment - 3 / Programs", keywords: ["aggregate function avg", "avg function", "avg()", "average aggregate", "sql avg", "avg"] },
  { number: 14, name: "Aggregate function - MIN", module: "Experiment - 3 / Programs", keywords: ["aggregate function min", "min function", "min()", "minimum aggregate", "sql min", "min"] },
  { number: 15, name: "Aggregate function - MAX", module: "Experiment - 3 / Programs", keywords: ["aggregate function max", "max function", "max()", "maximum aggregate", "sql max", "max"] },
  { number: 16, name: "Aggregate function - SUM", module: "Experiment - 3 / Programs", keywords: ["aggregate function sum", "sum function", "sum()", "sum aggregate", "sql sum", "sum"] },
  { number: 17, name: "Simple Queries - Group By and Having Clause", module: "Experiment - 3 / Programs", keywords: ["group by and having clause", "group by having", "group by", "having clause", "simple queries group by", "group by having clause"] },
  { number: 18, name: "Managing and Updating Foreign Trip Information", module: "Experiment - 3 / Programs", keywords: ["managing and updating foreign trip information", "foreign trip information", "foreign trip", "updating foreign trip", "foreign trips"] },
  { number: 19, name: "TO_CHAR", module: "Experiment - 4 / Conversion Functions", keywords: ["to_char", "to char", "conversion functions to_char", "to_char conversion", "to_char function"] },
  { number: 20, name: "TO_NUMBER", module: "Experiment - 4 / Conversion Functions", keywords: ["to_number", "to number", "conversion functions to_number", "to_number conversion", "to_number function"] },
  { number: 21, name: "TO_DATE", module: "Experiment - 4 / Conversion Functions", keywords: ["to_date", "to date", "conversion functions to_date", "to_date conversion", "to_date function"] },
  { number: 22, name: "RTRIM", module: "Experiment - 4 / String Functions", keywords: ["rtrim", "rtrim function", "string functions rtrim", "right trim"] },
  { number: 23, name: "LPAD", module: "Experiment - 4 / String Functions", keywords: ["lpad", "lpad function", "string functions lpad", "left pad"] },
  { number: 24, name: "RPAD", module: "Experiment - 4 / String Functions", keywords: ["rpad", "rpad function", "string functions rpad", "right pad"] },
  { number: 25, name: "LTRIM", module: "Experiment - 4 / String Functions", keywords: ["ltrim", "ltrim function", "string functions ltrim", "left trim"] },
  { number: 26, name: "LOWER", module: "Experiment - 4 / String Functions", keywords: ["lower function", "string functions lower", "sql lower", "lower"] },
  { number: 27, name: "UPPER", module: "Experiment - 4 / String Functions", keywords: ["upper function", "string functions upper", "sql upper", "upper"] },
  { number: 28, name: "INITCAP", module: "Experiment - 4 / String Functions", keywords: ["initcap", "initcap function", "string functions initcap"] },
  { number: 29, name: "LENGTH", module: "Experiment - 4 / String Functions", keywords: ["length function", "string functions length", "sql length", "length"] },
  { number: 30, name: "SUBSTR", module: "Experiment - 4 / String Functions", keywords: ["substr", "substr function", "substring function", "string functions substr"] },
  { number: 31, name: "Employee Salary Lookup System", module: "Experiment - 5 / Programs", keywords: ["employee salary lookup system", "employee salary lookup", "salary lookup system", "salary lookup", "lookup system"] },
  { number: 32, name: "COMMIT", module: "Experiment - 5 / Programs", keywords: ["commit", "tcl commit", "commit transaction", "sql commit", "commit work"] },
  { number: 33, name: "SAVEPOINT", module: "Experiment - 5 / Programs", keywords: ["savepoint", "tcl savepoint", "savepoint transaction", "sql savepoint"] },
  { number: 34, name: "ROLLBACK", module: "Experiment - 5 / Programs", keywords: ["rollback", "tcl rollback", "rollback transaction", "sql rollback", "rollback to savepoint"] },
  { number: 35, name: "Determine Scholarship Eligibility Using Nested IF", module: "Experiment - 6 / Programs", keywords: ["determine scholarship eligibility using nested if", "scholarship eligibility nested if", "scholarship eligibility", "nested if scholarship", "plsql nested if", "nested if"] },
  { number: 36, name: "Determine Employee Bonus Using CASE Statement", module: "Experiment - 6 / Programs", keywords: ["determine employee bonus using case statement", "employee bonus case statement", "employee bonus", "bonus case statement", "case statement bonus", "case statement"] },
  { number: 37, name: "Determine Shipping Category Using CASE Expression", module: "Experiment - 6 / Programs", keywords: ["determine shipping category using case expression", "shipping category case expression", "shipping category", "case expression shipping", "case expression"] },
  { number: 38, name: "Determine Employee Contact Number Using NULLIF() and COALESCE()", module: "Experiment - 6 / Programs", keywords: ["determine employee contact number using nullif() and coalesce()", "nullif and coalesce", "employee contact number nullif coalesce", "nullif", "coalesce", "nullif()", "coalesce()"] },
  { number: 39, name: "Countdown Sequence - Control Statement - While Loop", module: "Experiment - 7 / Programs", keywords: ["countdown sequence while loop", "countdown sequence", "control statement while loop", "while loop countdown", "plsql while loop", "while loop"] },
  { number: 40, name: "Sum of Integers - Control Statement - For Loop", module: "Experiment - 7 / Programs", keywords: ["sum of integers for loop", "sum of integers", "control statement for loop", "for loop sum", "plsql for loop", "for loop"] },
  { number: 41, name: "Process Student Marks Using Nested Loops and Exception Handling", module: "Experiment - 7 / Programs", keywords: ["process student marks using nested loops and exception handling", "process student marks", "nested loops and exception handling", "student marks nested loops", "marks exception handling", "nested loops exception"] },
  { number: 42, name: "Handle Duplicate Employee ID Using Built-in Exception", module: "Experiment - 7 / Programs", keywords: ["handle duplicate employee id using built-in exception", "handle duplicate employee id", "duplicate employee id", "built-in exception duplicate", "dup_val_on_index", "duplicate employee"] },
  { number: 43, name: "Space Mission Signal Validation System", module: "Experiment - 7 / Programs", keywords: ["space mission signal validation system", "space mission signal validation", "signal validation system", "space mission signal", "space mission"] },
  { number: 44, name: "IN, OUT and INOUT Parameters", module: "Experiment - 8 / Programs", keywords: ["in, out and inout parameters", "in out and inout parameters", "in out inout parameters", "in out inout", "procedure parameters", "plsql parameters", "in out inout parameter"] },
  { number: 45, name: "Hospital Staff Salary Update", module: "Experiment - 9 / Programs", keywords: ["hospital staff salary update", "hospital staff salary", "staff salary update", "hospital salary update", "hospital staff"] },
  { number: 46, name: "Movie Review Rating Categorization System", module: "Experiment - 10 / Programs", keywords: ["movie review rating categorization system", "movie review rating", "movie review rating categorization", "movie rating categorization", "movie review rating system"] },
  { number: 47, name: "Library Book Availability Update Using a FOR UPDATE Cursor", module: "Experiment - 10 / Programs", keywords: ["library book availability update using a for update cursor", "library book availability update", "for update cursor", "book availability for update", "library book availability", "cursor for update"] },
  { number: 48, name: "Student Marks Update Using WHERE CURRENT OF", module: "Experiment - 10 / Programs", keywords: ["student marks update using where current of", "where current of", "student marks update where current of", "cursor where current of", "update where current of"] },
  { number: 49, name: "Customer Order Details Using a Cursor Variable", module: "Experiment - 10 / Programs", keywords: ["customer order details using a cursor variable", "customer order details cursor variable", "cursor variable", "ref cursor customer order", "customer order details", "ref cursor"] },
  { number: 50, name: "Library Book Borrowing System", module: "Experiment - 11 / Programs", keywords: ["library book borrowing system", "book borrowing system", "library book borrowing", "book borrowing trigger", "library borrowing"] },
  { number: 51, name: "Delivery Date Correction System", module: "Experiment - 11 / Programs", keywords: ["delivery date correction system", "delivery date correction", "delivery date trigger", "delivery date"] },
  { number: 52, name: "Statement-Level Trigger – Update Audit Counter", module: "Experiment - 11 / Programs", keywords: ["statement-level trigger update audit counter", "statement-level trigger", "statement level trigger", "update audit counter", "audit counter trigger", "statement level trigger audit"] },
  { number: 53, name: "Log Product Deletion Operations Using a BEFORE Statement-Level Trigger", module: "Experiment - 11 / Programs", keywords: ["log product deletion operations using a before statement-level trigger", "log product deletion operations", "before statement-level trigger", "product deletion trigger", "product deletion", "before statement level trigger"] },
  { number: 54, name: "Movie Streaming Platform", module: "Experiment - 12 / Programs", keywords: ["movie streaming platform", "movie streaming", "streaming platform", "package movie streaming", "plsql package movie streaming"] }
];

const SYLLABUS_COURSES = {
  java: {
    key: "java",
    category: "java",
    title: "Java Programming",
    course: "Object Oriented Programming through Java Lab",
    courseCode: "B23CS2105",
    icon: "☕",
    totalExperiments: 35,
    experiments: JAVA_EXPERIMENTS
  },
  python: {
    key: "python",
    category: "python",
    title: "Python Programming",
    course: "Python Programming Skill Enhancement Lab",
    courseCode: "B23CS2106",
    icon: "🐍",
    totalExperiments: 40,
    experiments: PYTHON_EXPERIMENTS
  },
  dbms: {
    key: "dbms",
    category: "dbms",
    title: "Database Management Systems",
    course: "Database Management Systems Lab ( CSE, AIML, CSIT & CSG)",
    courseCode: "B23CS2104",
    icon: "🗄️",
    totalExperiments: 54,
    experiments: DBMS_EXPERIMENTS
  },
  adsa: {
    key: "adsa",
    category: "adsa",
    title: "Advanced Data Structures and Algorithms",
    course: "Advanced Data Structures and Algorithms using C Lab",
    courseCode: "B23CI2102 - CIC",
    icon: "🌳",
    totalExperiments: 16,
    experiments: DSA_EXPERIMENTS
  }
};

function getCourseByKey(key) {
  if (!key) return null;
  const clean = key.toLowerCase().trim();
  if (clean === 'java') return SYLLABUS_COURSES.java;
  if (clean === 'python' || clean === 'py') return SYLLABUS_COURSES.python;
  if (clean === 'adsa' || clean === 'dsa') return SYLLABUS_COURSES.adsa;
  if (clean === 'dbms' || clean === 'sql') return SYLLABUS_COURSES.dbms;
  return null;
}

function getAllOfficialExperiments() {
  const list = [];
  for (const course of Object.values(SYLLABUS_COURSES)) {
    for (const exp of course.experiments) {
      list.push({
        courseKey: course.key,
        category: course.category,
        course: course.course,
        courseCode: course.courseCode,
        courseIcon: course.icon,
        experimentNumber: exp.number,
        experimentName: exp.name,
        module: exp.module || null,
        keywords: exp.keywords
      });
    }
  }
  return list;
}

module.exports = {
  JAVA_EXPERIMENTS,
  PYTHON_EXPERIMENTS,
  DSA_EXPERIMENTS,
  DBMS_EXPERIMENTS,
  SYLLABUS_COURSES,
  getCourseByKey,
  getAllOfficialExperiments
};
