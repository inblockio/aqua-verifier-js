#!/bin/bash

# Function to check if previous command was successful
check_status() {
    if [ $? -ne 0 ]; then
        echo "Error: Command failed"
        exit 1
    fi
}

echo "Starting linking test sequence..."

# Notarize README.md
echo "1. Creating AQUA file for README.md..."
./notarize.js README.md
check_status

# Notarize LICENSE
echo "2. Creating AQUA file for LICENSE..."
./notarize.js LICENSE
check_status

# Notarize notarize.js
echo "3. Creating AQUA file for notarize.js..."
./notarize.js notarize.js
check_status

# Create link between files
echo "4. Creating link between files..."
./notarize.js --link LICENSE,notarize.js README.md
check_status

# Verify README.md
echo "5. Verifying README.md..."
./verify.js README.md
check_status

echo "All operations completed successfully!"


# # Cleanup section
# echo -e "\nStarting cleanup operations..."
#
# echo "1. Removing README.md.aqua.json..."
# rm -f README.md.aqua.json
# check_status
#
# echo "2. Removing LICENSE.md.aqua.json..."
# rm -f LICENSE.md.aqua.json
# check_status
#
# echo "3. Removing notarize.js.md.aqua.json..."
# rm -f notarize.js.md.aqua.json
# check_status
#
# echo "Cleanup completed successfully!" 
