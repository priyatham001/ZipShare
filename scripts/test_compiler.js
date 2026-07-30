const http = require('http');

const tests = [
  {
    name: 'Java Hello World',
    body: {
      extension: 'java',
      filename: 'HelloWorld.java',
      sourceCode: `public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}`
    },
    expectedSubstring: 'Hello, World!'
  },
  {
    name: 'Java Default Primitive Values',
    body: {
      extension: 'java',
      filename: 'DefaultValues.java',
      sourceCode: `public class DefaultValues {
    static byte b;
    static short s;
    static int i;
    static long l;
    static float f;
    static double d;
    static char c;
    static boolean bool;

    public static void main(String[] args) {
        System.out.println("int=" + i + ", bool=" + bool);
    }
}`
    },
    expectedSubstring: 'int=0, bool=false'
  },
  {
    name: 'Java Quadratic Equation',
    body: {
      extension: 'java',
      filename: 'Quadratic.java',
      sourceCode: `public class Quadratic {
    public static void main(String[] args) {
        double a = 1, b = -5, c = 6;
        double d = b * b - 4 * a * c;
        if (d > 0) {
            double r1 = (-b + Math.sqrt(d)) / (2 * a);
            double r2 = (-b - Math.sqrt(d)) / (2 * a);
            System.out.println("Roots: " + r1 + " and " + r2);
        }
    }
}`
    },
    expectedSubstring: 'Roots: 3.0 and 2.0'
  },
  {
    name: 'C Hello World',
    body: {
      extension: 'c',
      filename: 'hello.c',
      sourceCode: `#include <stdio.h>
int main() {
    printf("Hello from C!\\n");
    return 0;
}`
    },
    expectedSubstring: 'Hello from C!'
  },
  {
    name: 'Bubble Sort in C',
    body: {
      extension: 'c',
      filename: 'bubblesort.c',
      sourceCode: `#include <stdio.h>
void bubbleSort(int arr[], int n) {
    for (int i = 0; i < n - 1; i++) {
        for (int j = 0; j < n - i - 1; j++) {
            if (arr[j] > arr[j + 1]) {
                int temp = arr[j];
                arr[j] = arr[j + 1];
                arr[j + 1] = temp;
            }
        }
    }
}
int main() {
    int arr[] = {64, 34, 25, 12, 22, 11, 90};
    int n = sizeof(arr) / sizeof(arr[0]);
    bubbleSort(arr, n);
    for (int i = 0; i < n; i++) {
        printf("%d ", arr[i]);
    }
    printf("\\n");
    return 0;
}`
    },
    expectedSubstring: '11 12 22 25 34 64 90'
  },
  {
    name: 'C++ Hello World',
    body: {
      extension: 'cpp',
      filename: 'main.cpp',
      sourceCode: `#include <iostream>
using namespace std;
int main() {
    cout << "Hello C++!" << endl;
    return 0;
}`
    },
    expectedSubstring: 'Hello C++!'
  },
  {
    name: 'Python Hello World',
    body: {
      extension: 'py',
      filename: 'hello.py',
      sourceCode: `print("Hello Python!")`
    },
    expectedSubstring: 'Hello Python!'
  },
  {
    name: 'Python Prime Numbers',
    body: {
      extension: 'py',
      filename: 'primes.py',
      sourceCode: `def is_prime(n):
    if n <= 1:
        return False
    for i in range(2, int(n ** 0.5) + 1):
        if n % i == 0:
            return False
    return True

primes = [x for x in range(1, 20) if is_prime(x)]
print("Primes:", primes)`
    },
    expectedSubstring: 'Primes: [2, 3, 5, 7, 11, 13, 17, 19]'
  },
  {
    name: 'JavaScript Hello World',
    body: {
      extension: 'js',
      filename: 'index.js',
      sourceCode: `console.log("Hello JavaScript!");`
    },
    expectedSubstring: 'Hello JavaScript!'
  }
];

async function runTest(test) {
  const data = JSON.stringify(test.body);
  const options = {
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/compiler/run',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  };

  return new Promise((resolve) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          const stdout = json.stdout || '';
          const compileOutput = json.compile_output || '';
          const stderr = json.stderr || '';
          const passed = stdout.includes(test.expectedSubstring);
          resolve({
            name: test.name,
            passed,
            status: json.status?.description,
            time: json.time,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            compileOutput: compileOutput.trim()
          });
        } catch (e) {
          resolve({ name: test.name, passed: false, error: e.message, body });
        }
      });
    });

    req.on('error', (err) => resolve({ name: test.name, passed: false, error: err.message }));
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('--- RUNNING COMPILER TEST SUITE ---');
  let allPassed = true;
  for (const test of tests) {
    process.stdout.write(`Testing: ${test.name} ... `);
    const result = await runTest(test);
    if (result.passed) {
      console.log(`✔ PASS (${result.time}) -> ${result.stdout}`);
    } else {
      allPassed = false;
      console.log(`❌ FAIL`);
      console.log('Result details:', JSON.stringify(result, null, 2));
    }
  }
  if (allPassed) {
    console.log('\n🎉 ALL COMPILER TESTS PASSED PERFECTLY!');
  } else {
    console.log('\n❌ SOME TESTS FAILED. PLEASE FIX.');
    process.exit(1);
  }
}

main();
