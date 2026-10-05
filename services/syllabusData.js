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
  SYLLABUS_COURSES,
  getCourseByKey,
  getAllOfficialExperiments
};
