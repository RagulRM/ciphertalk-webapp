// MongoDB Connection String Verifier
// Run with: node verify-connection-string.js

require('dotenv').config();

const connectionString = process.env.MONGODB_URI;

console.log('🔍 MongoDB Connection String Analysis\n');

if (!connectionString) {
    console.error('❌ No MONGODB_URI found in environment variables');
    console.log('💡 Make sure you have a .env file with MONGODB_URI=your_connection_string');
    process.exit(1);
}

console.log('✅ Connection string found');
console.log('📏 Length:', connectionString.length);
console.log('🔍 Preview:', connectionString.substring(0, 30) + '...' + connectionString.substring(connectionString.length - 30));

// Analyze connection string components
const analysis = {
    hasProtocol: connectionString.startsWith('mongodb+srv://'),
    hasUsername: connectionString.includes('@') && connectionString.split('@')[0].includes(':'),
    hasCluster: connectionString.includes('.mongodb.net'),
    hasDatabase: connectionString.includes('.mongodb.net/') && connectionString.split('.mongodb.net/')[1].split('?')[0].length > 0,
    hasRetryWrites: connectionString.includes('retryWrites=true'),
    hasWriteConcern: connectionString.includes('w=majority')
};

console.log('\n📋 Connection String Analysis:');
console.log('  Protocol (mongodb+srv://):', analysis.hasProtocol ? '✅' : '❌');
console.log('  Username & Password:', analysis.hasUsername ? '✅' : '❌');
console.log('  MongoDB Cluster:', analysis.hasCluster ? '✅' : '❌');
console.log('  Database Name:', analysis.hasDatabase ? '✅' : '❌');
console.log('  Retry Writes:', analysis.hasRetryWrites ? '✅' : '❌');
console.log('  Write Concern:', analysis.hasWriteConcern ? '✅' : '❌');

// Extract components
try {
    const url = new URL(connectionString.replace('mongodb+srv://', 'https://'));
    const username = url.username;
    const password = url.password ? '***HIDDEN***' : 'NOT_SET';
    const hostname = url.hostname;
    const database = url.pathname.replace('/', '').split('?')[0];
    const params = new URLSearchParams(url.search);
    
    console.log('\n🔧 Connection String Components:');
    console.log('  Username:', username || 'NOT_SET');
    console.log('  Password:', password);
    console.log('  Cluster Host:', hostname);
    console.log('  Database:', database || 'NOT_SET');
    console.log('  Parameters:');
    for (const [key, value] of params) {
        console.log(`    ${key}: ${value}`);
    }
    
} catch (error) {
    console.error('\n❌ Error parsing connection string:', error.message);
}

// Validation
const issues = [];
if (!analysis.hasProtocol) issues.push('Missing mongodb+srv:// protocol');
if (!analysis.hasUsername) issues.push('Missing username or password');
if (!analysis.hasCluster) issues.push('Missing .mongodb.net cluster');
if (!analysis.hasDatabase) issues.push('Missing database name');

if (issues.length > 0) {
    console.log('\n⚠️  Issues Found:');
    issues.forEach(issue => console.log(`  - ${issue}`));
    
    console.log('\n💡 Correct Format:');
    console.log('mongodb+srv://USERNAME:PASSWORD@CLUSTER.xxxxx.mongodb.net/DATABASE?retryWrites=true&w=majority');
} else {
    console.log('\n✅ Connection string format looks correct!');
}

console.log('\n🔗 To get a fresh connection string:');
console.log('1. Go to https://cloud.mongodb.com/');
console.log('2. Click "Connect" on your cluster');
console.log('3. Choose "Connect your application"');
console.log('4. Select "Node.js" driver');
console.log('5. Copy the connection string and replace <username>, <password>, <database>');
