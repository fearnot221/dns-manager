// Separate entrypoint so an older tools image fails closed with "file not found".
process.argv.push("--unlink");
void import("./link-logto-user");
