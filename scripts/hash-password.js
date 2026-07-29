// Usage: node scripts/hash-password.js YourRealPassword
// Copy the printed hash into ADMIN_PASSWORD_HASH in your .env file.
const bcrypt = require('bcryptjs');

const plain = process.argv[2];
if (!plain) {
  console.error('Usage: node scripts/hash-password.js <password>');
  process.exit(1);
}

bcrypt.hash(plain, 10).then((hash) => {
  console.log('\nAdd this to your .env as ADMIN_PASSWORD_HASH:\n');
  console.log(hash);
  console.log('');
});
