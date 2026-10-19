local group = vim.api.nvim_create_augroup("prettier_on_save", { clear = true })

vim.api.nvim_create_autocmd("BufWritePost", {
    group = group,
    pattern = { "*.ts", "*.json", "*.jsonc", "*.yaml", "*.yml", "*.md" },
    callback = function(args)
        local bufnr = args.buf
        local path = vim.api.nvim_buf_get_name(bufnr)

        if path == "" then
            return;
        end

        local current_script_pathname = debug.getinfo(1, "S").source
        local project_root = vim.fn.fnamemodify(current_script_pathname:sub(2), ":h")

        vim.fn.jobstart({ "pnpm", "exec", "prettier", "--write", path, "--ignore-path", vim.fs.joinpath(project_root, ".prettierignore") }, {
            cwd = project_root,
            on_exit = function(_, code)
                vim.schedule(function()
                    if code == 0 then
                        if vim.api.nvim_buf_is_loaded(bufnr) and not vim.bo[bufnr].modified then
                            vim.api.nvim_buf_call(bufnr, function()
                                vim.cmd("checktime")
                            end)
                        end
                    else
                        vim.notify("'pnpm exec prettier --write " .. path .. "' exited with code " .. code)
                    end
                end)
            end
        })
    end
})

