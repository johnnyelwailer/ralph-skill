#
file_contents="$(cat test_input.txt; printf x)"
file_contents="${file_contents%x}"
printf "[[%s]]" "$file_contents"
