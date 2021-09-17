export interface GithubPR {
    user: {
        login: string,
    },
    head: {
        ref: string,
        repo: {
            fullname: string
        },
        base: {
            user: {
                login: string
            }
        }
    },
    base: {
        user: {
            login: string
        },
        repo: {
            full_name: string
        }
    },
}

export interface GithubError {
    message: string,
    documentation_url: string
}
