module.exports = {
  hooks: {
    readPackage(pkg) {
      // Allow all build scripts
      if (pkg.name === '@prisma/engines' || 
          pkg.name === 'prisma' || 
          pkg.name === 'sharp' || 
          pkg.name === 'unrs-resolver') {
        // These packages need their build scripts to run
      }
      return pkg;
    }
  }
};
